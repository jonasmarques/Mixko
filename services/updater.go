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

// isNewerVersion compares semantic versions component by component, so a
// release that only bumps the patch (v1.0.0 -> v1.0.1) is still detected.
func isNewerVersion(current, latest string) bool {
	cur := parseVersionParts(cleanVersionString(current))
	lat := parseVersionParts(cleanVersionString(latest))

	for i := range lat {
		if lat[i] != cur[i] {
			return lat[i] > cur[i]
		}
	}
	return false
}

func cleanVersionString(v string) string {
	v = strings.TrimSpace(v)
	v = strings.TrimPrefix(v, "v")
	v = strings.TrimPrefix(v, "V")

	// Drop any pre-release or build suffix (1.2.3-beta.1, 1.2.3+abc) so only
	// the numeric core is compared.
	if idx := strings.IndexAny(v, "-+"); idx != -1 {
		v = v[:idx]
	}
	return v
}

// parseVersionParts returns major, minor and patch. Missing or malformed
// components count as zero.
func parseVersionParts(v string) [3]int {
	var out [3]int
	for i, part := range strings.Split(v, ".") {
		if i >= len(out) {
			break
		}
		out[i], _ = strconv.Atoi(part)
	}
	return out
}
