// Hebrew text detection utilities

/// Check if a string contains any Hebrew characters
pub fn contains_hebrew(text: &str) -> bool {
    text.chars().any(|c| {
        // Hebrew Unicode range: U+0590 to U+05FF
        matches!(c, '\u{0590}'..='\u{05FF}')
    })
}

/// Check if text needs transliteration (has Hebrew characters)
pub fn needs_transliteration(title: &str, artist: &str, album: &str) -> bool {
    contains_hebrew(title) || contains_hebrew(artist) || contains_hebrew(album)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_contains_hebrew() {
        assert!(contains_hebrew("שלום"));
        assert!(contains_hebrew("Hello שלום"));
        assert!(!contains_hebrew("Hello World"));
        assert!(!contains_hebrew(""));
    }

    #[test]
    fn test_needs_transliteration() {
        assert!(needs_transliteration("היה טוב", "Omer Adam", "Album"));
        assert!(needs_transliteration("Song", "עומר אדם", "Album"));
        assert!(!needs_transliteration("Song", "Artist", "Album"));
    }
}
