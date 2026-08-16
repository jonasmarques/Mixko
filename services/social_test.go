package services

import (
	"testing"

	"github.com/bluesky-social/indigo/api/bsky"
)

func isMutedWordsPref(p bsky.ActorDefs_Preferences_Elem) bool {
	return p.ActorDefs_MutedWordsPref != nil
}

func buildMutedWordsPref(words ...string) func() bsky.ActorDefs_Preferences_Elem {
	return func() bsky.ActorDefs_Preferences_Elem {
		return bsky.ActorDefs_Preferences_Elem{
			ActorDefs_MutedWordsPref: &bsky.ActorDefs_MutedWordsPref{Items: buildMutedWords(words)},
		}
	}
}

func TestReplacePrefAppendsWhenAbsent(t *testing.T) {
	adult := bsky.ActorDefs_Preferences_Elem{
		ActorDefs_AdultContentPref: &bsky.ActorDefs_AdultContentPref{Enabled: true},
	}

	got := replacePref([]bsky.ActorDefs_Preferences_Elem{adult}, isMutedWordsPref, buildMutedWordsPref("spoiler"))

	if len(got) != 2 {
		t.Fatalf("got %d preferences, want 2", len(got))
	}
	if got[0].ActorDefs_AdultContentPref == nil {
		t.Error("the unrelated preference was dropped")
	}
	if got[1].ActorDefs_MutedWordsPref == nil {
		t.Error("the new preference was not appended")
	}
}

func TestReplacePrefReplacesInPlace(t *testing.T) {
	prefs := []bsky.ActorDefs_Preferences_Elem{
		{ActorDefs_AdultContentPref: &bsky.ActorDefs_AdultContentPref{Enabled: true}},
		{ActorDefs_MutedWordsPref: &bsky.ActorDefs_MutedWordsPref{Items: buildMutedWords([]string{"old"})}},
		{ActorDefs_ThreadViewPref: &bsky.ActorDefs_ThreadViewPref{}},
	}

	got := replacePref(prefs, isMutedWordsPref, buildMutedWordsPref("new"))

	if len(got) != 3 {
		t.Fatalf("got %d preferences, want 3 (order and count preserved)", len(got))
	}
	// Position matters: unrelated preferences must not be reordered.
	if got[0].ActorDefs_AdultContentPref == nil || got[2].ActorDefs_ThreadViewPref == nil {
		t.Fatal("unrelated preferences were reordered or dropped")
	}

	items := got[1].ActorDefs_MutedWordsPref.Items
	if len(items) != 1 || items[0].Value != "new" {
		t.Errorf("muted words = %+v, want a single entry \"new\"", items)
	}
}

// A malformed account can end up with two muted-word prefs; keeping both would
// make the stale one win at random.
func TestReplacePrefCollapsesDuplicates(t *testing.T) {
	prefs := []bsky.ActorDefs_Preferences_Elem{
		{ActorDefs_MutedWordsPref: &bsky.ActorDefs_MutedWordsPref{Items: buildMutedWords([]string{"a"})}},
		{ActorDefs_MutedWordsPref: &bsky.ActorDefs_MutedWordsPref{Items: buildMutedWords([]string{"b"})}},
	}

	got := replacePref(prefs, isMutedWordsPref, buildMutedWordsPref("c"))

	if len(got) != 1 {
		t.Fatalf("got %d preferences, want 1", len(got))
	}
	if got[0].ActorDefs_MutedWordsPref.Items[0].Value != "c" {
		t.Error("the surviving preference is not the new one")
	}
}

func TestBuildMutedWordsTargets(t *testing.T) {
	items := buildMutedWords([]string{"spoiler", "leak"})

	if len(items) != 2 {
		t.Fatalf("got %d items, want 2", len(items))
	}
	for _, item := range items {
		if len(item.Targets) != 2 {
			t.Fatalf("word %q has %d targets, want content and tag", item.Value, len(item.Targets))
		}
		if *item.Targets[0] != "content" || *item.Targets[1] != "tag" {
			t.Errorf("word %q targets = %q/%q", item.Value, *item.Targets[0], *item.Targets[1])
		}
	}
}

func TestBuildMutedWordsEmptyIsNotNil(t *testing.T) {
	// A nil slice would serialise as JSON null and the server rejects it.
	if items := buildMutedWords(nil); items == nil {
		t.Error("buildMutedWords(nil) returned nil, want an empty slice")
	}
}

func TestBuildContentLabelPrefsMapsShowToIgnore(t *testing.T) {
	prefs := buildContentLabelPrefs([]ContentFilterDTO{
		{Label: "nudity", Visibility: "show"},
		{Label: "gore", Visibility: "hide", LabelerDid: "did:plc:abc"},
	})

	if len(prefs) != 2 {
		t.Fatalf("got %d preferences, want 2", len(prefs))
	}

	first := prefs[0].ActorDefs_ContentLabelPref
	if first.Visibility != "ignore" {
		t.Errorf("visibility = %q, want the lexicon's \"ignore\"", first.Visibility)
	}
	if first.LabelerDid != nil {
		t.Error("an empty labeler DID should stay unset, not become an empty string")
	}

	second := prefs[1].ActorDefs_ContentLabelPref
	if second.Visibility != "hide" {
		t.Errorf("visibility = %q, want \"hide\" passed through", second.Visibility)
	}
	if second.LabelerDid == nil || *second.LabelerDid != "did:plc:abc" {
		t.Error("labeler DID was not carried over")
	}
}
