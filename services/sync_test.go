package services

import (
	"net/url"
	"strings"
	"testing"
	"time"
)

// The previous URL pointed at a host that does not exist and a path Jetstream
// does not serve, so the subscription silently never connected. These assert
// the shape the public instances actually accept.
func TestJetstreamURLTargetsTheSubscribeEndpoint(t *testing.T) {
	raw := jetstreamURL("jetstream1.us-east.bsky.network", "did:plc:abc123")

	parsed, err := url.Parse(raw)
	if err != nil {
		t.Fatalf("built an unparseable URL %q: %v", raw, err)
	}

	if parsed.Scheme != "wss" {
		t.Errorf("scheme = %q, want wss", parsed.Scheme)
	}
	if parsed.Host != "jetstream1.us-east.bsky.network" {
		t.Errorf("host = %q", parsed.Host)
	}
	if parsed.Path != "/subscribe" {
		t.Errorf("path = %q, want /subscribe", parsed.Path)
	}

	q := parsed.Query()
	if got := q.Get("wantedDids"); got != "did:plc:abc123" {
		t.Errorf("wantedDids = %q", got)
	}
	// Jetstream takes one collection per repeated key, not a joined list.
	if got := len(q["wantedCollections"]); got != len(jetstreamCollections) {
		t.Errorf("wantedCollections count = %d, want %d", got, len(jetstreamCollections))
	}
	if strings.Contains(raw, "xrpc") {
		t.Errorf("URL still carries an xrpc path: %q", raw)
	}
}

func TestJetstreamHostsAreDistinctNumberedInstances(t *testing.T) {
	if len(jetstreamHosts) == 0 {
		t.Fatal("no hosts configured")
	}

	seen := map[string]bool{}
	for _, host := range jetstreamHosts {
		if seen[host] {
			t.Errorf("duplicate host %q", host)
		}
		seen[host] = true

		// "jetstream.us-east.bsky.network" resolves to unrelated hosting; only
		// the numbered instances are real.
		if !strings.HasPrefix(host, "jetstream1.") && !strings.HasPrefix(host, "jetstream2.") {
			t.Errorf("host %q is not a numbered Jetstream instance", host)
		}
	}
}

func TestJetstreamBackoffGrowsAndStaysBounded(t *testing.T) {
	if got := jetstreamBackoff(0); got != 2*time.Second {
		t.Errorf("first retry = %v, want 2s", got)
	}

	for attempt := 1; attempt <= 20; attempt++ {
		got := jetstreamBackoff(attempt)
		if got <= 0 || got > jetstreamMaxBackoff {
			t.Errorf("attempt %d gave %v, outside (0, %v]", attempt, got, jetstreamMaxBackoff)
		}
	}

	// Jitter has to actually vary, or every client reconnects in lockstep.
	first := jetstreamBackoff(6)
	varied := false
	for i := 0; i < 50 && !varied; i++ {
		if jetstreamBackoff(6) != first {
			varied = true
		}
	}
	if !varied {
		t.Error("backoff produced no jitter across 50 calls")
	}
}
