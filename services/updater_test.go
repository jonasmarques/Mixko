package services

import "testing"

func TestIsNewerVersion(t *testing.T) {
	tests := []struct {
		current string
		latest  string
		want    bool
	}{
		{"v1.0.0", "v1.0.1", true}, // patch bumps used to be missed entirely
		{"v1.0.0", "v1.1.0", true},
		{"v1.0.0", "v2.0.0", true},
		{"v1.2.3", "v1.2.3", false},
		{"v1.2.3", "v1.2.2", false},
		{"v2.0.0", "v1.9.9", false},
		{"v1.9.0", "v1.10.0", true}, // numeric, not lexicographic
		{"1.0.0", "v1.0.1", true},   // the "v" prefix is optional
		{"V1.0", "v1.0.1", true},    // missing components count as zero
		{"v1.0.1", "v1.0", false},
		{"v1.0.0", "v1.0.1-beta", true}, // pre-release suffix is ignored
		{"v1.0.0", "", false},           // empty tag must not look like an update
		{"v1.0.0", "garbage", false},
	}

	for _, tt := range tests {
		if got := isNewerVersion(tt.current, tt.latest); got != tt.want {
			t.Errorf("isNewerVersion(%q, %q) = %v, want %v", tt.current, tt.latest, got, tt.want)
		}
	}
}

func TestCleanVersionString(t *testing.T) {
	tests := map[string]string{
		" v1.2.3 ":     "1.2.3",
		"V1.2.3":       "1.2.3",
		"1.2.3-beta.1": "1.2.3",
		"1.2.3+build7": "1.2.3",
		"1.2.3":        "1.2.3",
	}

	for in, want := range tests {
		if got := cleanVersionString(in); got != want {
			t.Errorf("cleanVersionString(%q) = %q, want %q", in, got, want)
		}
	}
}
