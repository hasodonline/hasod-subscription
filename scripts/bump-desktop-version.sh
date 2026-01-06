#!/bin/bash

# Desktop Version Bump Script
# Updates version in all desktop-related files and optionally creates a git tag
#
# Usage: ./scripts/bump-desktop-version.sh <version>
# Example: ./scripts/bump-desktop-version.sh 0.2.0

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Check for version argument
if [ -z "$1" ]; then
    echo -e "${RED}Error: Version argument required${NC}"
    echo "Usage: $0 <version>"
    echo "Example: $0 0.2.0"
    exit 1
fi

NEW_VERSION="$1"

# Validate version format (semver)
if ! [[ "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo -e "${RED}Error: Invalid version format${NC}"
    echo "Version must be in semver format: X.Y.Z (e.g., 0.2.0)"
    exit 1
fi

echo -e "${YELLOW}Bumping desktop app version to ${NEW_VERSION}${NC}"
echo ""

# File paths
TAURI_CONF="$PROJECT_ROOT/packages/desktop/src-tauri/tauri.conf.json"
CARGO_TOML="$PROJECT_ROOT/packages/desktop/src-tauri/Cargo.toml"
PACKAGE_JSON="$PROJECT_ROOT/packages/desktop/package.json"

# Function to update version in JSON file using jq or sed
update_json_version() {
    local file="$1"
    local new_version="$2"

    if command -v jq &> /dev/null; then
        # Use jq if available (preserves formatting better)
        local tmp=$(mktemp)
        jq --arg v "$new_version" '.version = $v' "$file" > "$tmp" && mv "$tmp" "$file"
    else
        # Fallback to sed
        sed -i.bak "s/\"version\": \"[^\"]*\"/\"version\": \"$new_version\"/" "$file"
        rm -f "${file}.bak"
    fi
}

# Update tauri.conf.json
if [ -f "$TAURI_CONF" ]; then
    echo -e "Updating ${GREEN}tauri.conf.json${NC}..."
    update_json_version "$TAURI_CONF" "$NEW_VERSION"
    echo "  Done"
else
    echo -e "${RED}Warning: tauri.conf.json not found at $TAURI_CONF${NC}"
fi

# Update Cargo.toml
if [ -f "$CARGO_TOML" ]; then
    echo -e "Updating ${GREEN}Cargo.toml${NC}..."
    sed -i.bak "s/^version = \"[^\"]*\"/version = \"$NEW_VERSION\"/" "$CARGO_TOML"
    rm -f "${CARGO_TOML}.bak"
    echo "  Done"
else
    echo -e "${RED}Warning: Cargo.toml not found at $CARGO_TOML${NC}"
fi

# Update package.json
if [ -f "$PACKAGE_JSON" ]; then
    echo -e "Updating ${GREEN}package.json${NC}..."
    update_json_version "$PACKAGE_JSON" "$NEW_VERSION"
    echo "  Done"
else
    echo -e "${RED}Warning: package.json not found at $PACKAGE_JSON${NC}"
fi

echo ""
echo -e "${GREEN}Version updated to ${NEW_VERSION}${NC}"
echo ""

# Show updated versions for verification
echo "Verification:"
echo "-------------"

if [ -f "$TAURI_CONF" ]; then
    TAURI_VERSION=$(grep -o '"version": "[^"]*"' "$TAURI_CONF" | head -1 | cut -d'"' -f4)
    echo "tauri.conf.json: $TAURI_VERSION"
fi

if [ -f "$CARGO_TOML" ]; then
    CARGO_VERSION=$(grep "^version = " "$CARGO_TOML" | head -1 | cut -d'"' -f2)
    echo "Cargo.toml: $CARGO_VERSION"
fi

if [ -f "$PACKAGE_JSON" ]; then
    PKG_VERSION=$(grep -o '"version": "[^"]*"' "$PACKAGE_JSON" | head -1 | cut -d'"' -f4)
    echo "package.json: $PKG_VERSION"
fi

echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Review the changes: git diff packages/desktop/"
echo "2. Commit: git add packages/desktop/ && git commit -m \"chore(desktop): bump version to $NEW_VERSION\""
echo "3. Push to master: git push origin master"
echo "4. GitHub Actions will automatically build and create a release"
echo ""
echo -e "${GREEN}Or run all at once:${NC}"
echo "git add packages/desktop/ && git commit -m \"chore(desktop): bump version to $NEW_VERSION\" && git push origin master"
