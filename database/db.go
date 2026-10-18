package database

import (
	"database/sql"
	"fmt"
	"strings"

	_ "modernc.org/sqlite"
)

type DB struct {
	conn *sql.DB
	cm   *CipherManager
}

func InitDB(dbPath string) (*DB, error) {
	// WAL lets the background sync read while the UI writes; busy_timeout keeps
	// those two from surfacing as "database is locked" to the user.
	dsn := dbPath + "?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)"

	conn, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	if err := conn.Ping(); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	cm, err := newCipherManager(dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to initialize cipher manager: %w", err)
	}

	db := &DB{conn: conn, cm: cm}
	if err := db.migrate(); err != nil {
		return nil, err
	}

	return db, nil
}

func (db *DB) migrate() error {
	queries := []string{
		`CREATE TABLE IF NOT EXISTS session_info (
			id INTEGER PRIMARY KEY CHECK (id = 1),
			did TEXT NOT NULL,
			handle TEXT NOT NULL,
			access_jwt TEXT NOT NULL,
			refresh_jwt TEXT NOT NULL,
			pds_host TEXT NOT NULL DEFAULT ''
		);`,
		`CREATE TABLE IF NOT EXISTS cache (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);`,
		`CREATE TABLE IF NOT EXISTS saved_accounts (
			did TEXT PRIMARY KEY,
			handle TEXT NOT NULL,
			access_jwt TEXT NOT NULL,
			refresh_jwt TEXT NOT NULL,
			pds_host TEXT NOT NULL DEFAULT '',
			is_active INTEGER NOT NULL DEFAULT 0
		);`,
	}

	for _, query := range queries {
		if _, err := db.conn.Exec(query); err != nil {
			return fmt.Errorf("failed to execute migration: %w", err)
		}
	}

	// Databases created before PDS discovery existed lack this column. SQLite
	// has no "ADD COLUMN IF NOT EXISTS", and re-adding it is the expected
	// failure here, so the error is deliberately ignored.
	_, _ = db.conn.Exec(`ALTER TABLE session_info ADD COLUMN pds_host TEXT NOT NULL DEFAULT ''`)

	return nil
}

func (db *DB) SaveSession(did, handle, accessJwt, refreshJwt, pdsHost string) error {
	encAccess, err := db.cm.Encrypt(accessJwt)
	if err != nil {
		return fmt.Errorf("failed to encrypt access token: %w", err)
	}
	encRefresh, err := db.cm.Encrypt(refreshJwt)
	if err != nil {
		return fmt.Errorf("failed to encrypt refresh token: %w", err)
	}

	query := `
		INSERT INTO session_info (id, did, handle, access_jwt, refresh_jwt, pds_host)
		VALUES (1, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			did=excluded.did,
			handle=excluded.handle,
			access_jwt=excluded.access_jwt,
			refresh_jwt=excluded.refresh_jwt,
			pds_host=excluded.pds_host;
	`
	if _, err = db.conn.Exec(query, did, handle, encAccess, encRefresh, pdsHost); err != nil {
		return err
	}

	if _, err = db.conn.Exec(`UPDATE saved_accounts SET is_active = 0 WHERE did != ?`, did); err != nil {
		return err
	}
	accQuery := `
		INSERT INTO saved_accounts (did, handle, access_jwt, refresh_jwt, pds_host, is_active)
		VALUES (?, ?, ?, ?, ?, 1)
		ON CONFLICT(did) DO UPDATE SET
			handle=excluded.handle,
			access_jwt=excluded.access_jwt,
			refresh_jwt=excluded.refresh_jwt,
			pds_host=excluded.pds_host,
			is_active=1;
	`
	_, err = db.conn.Exec(accQuery, did, handle, encAccess, encRefresh, pdsHost)
	return err
}

// Session is a stored login, as returned by GetSession.
type Session struct {
	DID        string
	Handle     string
	AccessJwt  string
	RefreshJwt string
	PDSHost    string
	IsActive   bool
}

// GetSession returns the saved session, or a zero Session when none exists.
func (db *DB) GetSession() (Session, error) {
	query := `SELECT did, handle, access_jwt, refresh_jwt, pds_host FROM session_info WHERE id = 1`
	var s Session
	var rawAccess, rawRefresh string
	err := db.conn.QueryRow(query).Scan(&s.DID, &s.Handle, &rawAccess, &rawRefresh, &s.PDSHost)
	if err == sql.ErrNoRows {
		return Session{}, nil
	}
	if err != nil {
		return Session{}, err
	}

	s.AccessJwt, err = db.cm.Decrypt(rawAccess)
	if err != nil {
		return Session{}, fmt.Errorf("failed to decrypt access token: %w", err)
	}
	s.RefreshJwt, err = db.cm.Decrypt(rawRefresh)
	if err != nil {
		return Session{}, fmt.Errorf("failed to decrypt refresh token: %w", err)
	}

	if !strings.HasPrefix(rawAccess, encPrefix) || !strings.HasPrefix(rawRefresh, encPrefix) {
		if saveErr := db.SaveSession(s.DID, s.Handle, s.AccessJwt, s.RefreshJwt, s.PDSHost); saveErr != nil {
			fmt.Printf("warning: failed to re-encrypt legacy session: %v\n", saveErr)
		}
	}

	return s, nil
}

func (db *DB) GetSavedAccounts() ([]Session, error) {
	activeSess, _ := db.GetSession()

	rows, err := db.conn.Query(`SELECT did, handle, access_jwt, refresh_jwt, pds_host, is_active FROM saved_accounts ORDER BY is_active DESC, handle ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var accounts []Session
	foundActive := false
	for rows.Next() {
		var s Session
		var rawAccess, rawRefresh string
		var activeInt int
		if err := rows.Scan(&s.DID, &s.Handle, &rawAccess, &rawRefresh, &s.PDSHost, &activeInt); err != nil {
			continue
		}
		accJwt, err1 := db.cm.Decrypt(rawAccess)
		refJwt, err2 := db.cm.Decrypt(rawRefresh)
		if err1 != nil || err2 != nil {
			continue
		}
		s.AccessJwt = accJwt
		s.RefreshJwt = refJwt
		s.IsActive = activeInt == 1 || (activeSess.DID != "" && s.DID == activeSess.DID)
		if s.DID == activeSess.DID {
			foundActive = true
		}
		accounts = append(accounts, s)
	}

	if activeSess.DID != "" && !foundActive {
		activeSess.IsActive = true
		_ = db.SaveSession(activeSess.DID, activeSess.Handle, activeSess.AccessJwt, activeSess.RefreshJwt, activeSess.PDSHost)
		accounts = append([]Session{activeSess}, accounts...)
	}

	return accounts, nil
}

func (db *DB) SwitchAccount(did string) (Session, error) {
	var s Session
	var rawAccess, rawRefresh string
	var activeInt int
	err := db.conn.QueryRow(`SELECT did, handle, access_jwt, refresh_jwt, pds_host, is_active FROM saved_accounts WHERE did = ?`, did).
		Scan(&s.DID, &s.Handle, &rawAccess, &rawRefresh, &s.PDSHost, &activeInt)
	if err != nil {
		return Session{}, err
	}
	s.AccessJwt, err = db.cm.Decrypt(rawAccess)
	if err != nil {
		return Session{}, err
	}
	s.RefreshJwt, err = db.cm.Decrypt(rawRefresh)
	if err != nil {
		return Session{}, err
	}
	if err := db.SaveSession(s.DID, s.Handle, s.AccessJwt, s.RefreshJwt, s.PDSHost); err != nil {
		return Session{}, err
	}
	s.IsActive = true
	return s, nil
}

func (db *DB) RemoveSavedAccount(did string) error {
	if _, err := db.conn.Exec(`DELETE FROM saved_accounts WHERE did = ?`, did); err != nil {
		return err
	}
	activeSess, _ := db.GetSession()
	if activeSess.DID == did {
		accounts, _ := db.GetSavedAccounts()
		if len(accounts) > 0 {
			next := accounts[0]
			return db.SaveSession(next.DID, next.Handle, next.AccessJwt, next.RefreshJwt, next.PDSHost)
		}
		return db.ClearSession()
	}
	return nil
}

func (db *DB) ClearSession() error {
	_, err := db.conn.Exec(`DELETE FROM session_info WHERE id = 1`)
	return err
}

func (db *DB) Close() error {
	return db.conn.Close()
}

