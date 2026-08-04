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
	conn, err := sql.Open("sqlite", dbPath)
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
			refresh_jwt TEXT NOT NULL
		);`,
		`CREATE TABLE IF NOT EXISTS cache (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);`,
	}

	for _, query := range queries {
		if _, err := db.conn.Exec(query); err != nil {
			return fmt.Errorf("failed to execute migration: %w", err)
		}
	}
	return nil
}

func (db *DB) SaveSession(did, handle, accessJwt, refreshJwt string) error {
	encAccess, err := db.cm.Encrypt(accessJwt)
	if err != nil {
		return fmt.Errorf("failed to encrypt access token: %w", err)
	}
	encRefresh, err := db.cm.Encrypt(refreshJwt)
	if err != nil {
		return fmt.Errorf("failed to encrypt refresh token: %w", err)
	}

	query := `
		INSERT INTO session_info (id, did, handle, access_jwt, refresh_jwt)
		VALUES (1, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			did=excluded.did,
			handle=excluded.handle,
			access_jwt=excluded.access_jwt,
			refresh_jwt=excluded.refresh_jwt;
	`
	_, err = db.conn.Exec(query, did, handle, encAccess, encRefresh)
	return err
}

func (db *DB) GetSession() (did, handle, accessJwt, refreshJwt string, err error) {
	query := `SELECT did, handle, access_jwt, refresh_jwt FROM session_info WHERE id = 1`
	var rawAccess, rawRefresh string
	err = db.conn.QueryRow(query).Scan(&did, &handle, &rawAccess, &rawRefresh)
	if err == sql.ErrNoRows {
		return "", "", "", "", nil
	}
	if err != nil {
		return "", "", "", "", err
	}

	accessJwt, err = db.cm.Decrypt(rawAccess)
	if err != nil {
		return "", "", "", "", fmt.Errorf("failed to decrypt access token: %w", err)
	}
	refreshJwt, err = db.cm.Decrypt(rawRefresh)
	if err != nil {
		return "", "", "", "", fmt.Errorf("failed to decrypt refresh token: %w", err)
	}

	if !strings.HasPrefix(rawAccess, encPrefix) || !strings.HasPrefix(rawRefresh, encPrefix) {
		if saveErr := db.SaveSession(did, handle, accessJwt, refreshJwt); saveErr != nil {
			fmt.Printf("warning: failed to re-encrypt legacy session: %v\n", saveErr)
		}
	}

	return did, handle, accessJwt, refreshJwt, nil
}

func (db *DB) ClearSession() error {
	_, err := db.conn.Exec(`DELETE FROM session_info WHERE id = 1`)
	return err
}

func (db *DB) Close() error {
	return db.conn.Close()
}

