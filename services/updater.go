package services

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// AppVersion pode ser sobrescrito na compilação via: -ldflags "-X mixko/services.AppVersion=v1.1"
var AppVersion = "v1.0"

type UpdaterService struct{}

func NewUpdaterService() *UpdaterService {
	return &UpdaterService{}
}

type githubReleaseResponse struct {
	TagName string `json:"tag_name"`
	HTMLURL string `json:"html_url"`
}

func (s *UpdaterService) CheckForUpdate() (*UpdateInfoDTO, error) {
	client := &http.Client{Timeout: 8 * time.Second}
	req, err := http.NewRequest("GET", "https://api.github.com/repos/jonasmarques/Mixko/releases/latest", nil)
	if err != nil {
		return &UpdateInfoDTO{
			HasUpdate:      false,
			CurrentVersion: AppVersion,
			LatestVersion:  AppVersion,
			ReleaseURL:     "https://github.com/jonasmarques/Mixko/releases",
		}, nil
	}

	req.Header.Set("User-Agent", "Mixko-App")
	req.Header.Set("Accept", "application/vnd.github.v3+json")

	resp, err := client.Do(req)
	if err != nil || resp.StatusCode != http.StatusOK {
		if resp != nil {
			resp.Body.Close()
		}
		return &UpdateInfoDTO{
			HasUpdate:      false,
			CurrentVersion: AppVersion,
			LatestVersion:  AppVersion,
			ReleaseURL:     "https://github.com/jonasmarques/Mixko/releases",
		}, nil
	}
	defer resp.Body.Close()

	var release githubReleaseResponse
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return &UpdateInfoDTO{
			HasUpdate:      false,
			CurrentVersion: AppVersion,
			LatestVersion:  AppVersion,
			ReleaseURL:     "https://github.com/jonasmarques/Mixko/releases",
		}, nil
	}

	latestTag := strings.TrimSpace(release.TagName)
	if latestTag == "" {
		latestTag = AppVersion
	}

	releaseURL := release.HTMLURL
	if releaseURL == "" {
		releaseURL = "https://github.com/jonasmarques/Mixko/releases"
	}

	hasUpdate := isNewerVersion(AppVersion, latestTag)

	return &UpdateInfoDTO{
		HasUpdate:      hasUpdate,
		CurrentVersion: AppVersion,
		LatestVersion:  latestTag,
		ReleaseURL:     releaseURL,
	}, nil
}

func isNewerVersion(current, latest string) bool {
	curClean := cleanVersionString(current)
	latClean := cleanVersionString(latest)

	curParts := strings.Split(curClean, ".")
	latParts := strings.Split(latClean, ".")

	curMajor, curMinor := parseVersionParts(curParts)
	latMajor, latMinor := parseVersionParts(latParts)

	if latMajor > curMajor {
		return true
	}
	if latMajor == curMajor && latMinor > curMinor {
		return true
	}

	return false
}

func cleanVersionString(v string) string {
	v = strings.TrimSpace(v)
	v = strings.TrimPrefix(v, "v")
	v = strings.TrimPrefix(v, "V")
	return v
}

func parseVersionParts(parts []string) (int, int) {
	major, minor := 0, 0
	if len(parts) > 0 {
		major, _ = strconv.Atoi(parts[0])
	}
	if len(parts) > 1 {
		minor, _ = strconv.Atoi(parts[1])
	}
	return major, minor
}
