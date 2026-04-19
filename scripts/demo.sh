#!/usr/bin/env bash

REPO="srijanshukla18/maintainers-cabinet-demo"
DASHBOARD="https://cabinet.autoprio.dev"

green="\033[0;32m"
yellow="\033[0;33m"
cyan="\033[0;36m"
bold="\033[1m"
reset="\033[0m"

header() {
  clear
  echo -e "${bold}${cyan}╔══════════════════════════════════════════╗"
  echo -e "║       Maintainer's Cabinet — Demo        ║"
  echo -e "╚══════════════════════════════════════════╝${reset}"
  echo ""
}

wait_and_open() {
  echo -e "\n${yellow}→ Waiting 3s then opening GitHub...${reset}"
  sleep 3
  open "$1"
  echo -e "${yellow}→ Watch for Cabinet labels + comment (~30s)${reset}"
  echo -e "${yellow}→ Then check dashboard: ${DASHBOARD}${reset}"
}

menu() {
  header
  echo -e "${bold}Pick a demo scene:${reset}\n"
  echo "  1) Vague issue        — triggers triage + community agents"
  echo "  2) Duplicate issue    — Cabinet detects similarity to #2"
  echo "  3) Security issue     — Cabinet flags, stays neutral publicly"
  echo "  4) Feature request    — classified, labelled, no close"
  echo "  5) Hostile user       — community agent rewrites bot tone"
  echo "  6) Good bug report    — full fields, classified as bug_likely"
  echo "  7) Slash: /cabinet triage     — re-triage on demand"
  echo "  8) Slash: /cabinet release-plan — draft release notes"
  echo "  9) Open dashboard"
  echo " 10) Run evals (pnpm eval)"
  echo ""
  echo "  q) Quit"
  echo ""
  echo -ne "${bold}Scene: ${reset}"
}

run_scene() {
  case $1 in
    1)
      header
      echo -e "${green}Scene 1 — Vague issue${reset}"
      echo "Creating issue: 'Crash on Mac' with no details..."
      URL=$(gh issue create \
        --repo "$REPO" \
        --title "Crash on Mac" \
        --body "It crashes when I run the command. Please fix." \
        2>&1 | grep -o 'https://github.com[^ ]*')
      echo -e "Created: ${cyan}${URL}${reset}"
      wait_and_open "$URL"
      ;;
    2)
      header
      echo -e "${green}Scene 2 — Duplicate issue${reset}"
      echo "Creating issue that mirrors the existing parser crash (#2)..."
      URL=$(gh issue create \
        --repo "$REPO" \
        --title "Same config crash as before" \
        --body "Getting the same crash as before with the config. Still broken after the latest version." \
        2>&1 | grep -o 'https://github.com[^ ]*')
      echo -e "Created: ${cyan}${URL}${reset}"
      wait_and_open "$URL"
      ;;
    3)
      header
      echo -e "${green}Scene 3 — Security-looking issue${reset}"
      echo "Creating issue with path traversal report..."
      URL=$(gh issue create \
        --repo "$REPO" \
        --title "Possible path traversal in config file loader" \
        --body "User-supplied file paths passed to readFileSync without sanitization. Could allow reading arbitrary files on the server." \
        2>&1 | grep -o 'https://github.com[^ ]*')
      echo -e "Created: ${cyan}${URL}${reset}"
      wait_and_open "$URL"
      ;;
    4)
      header
      echo -e "${green}Scene 4 — Feature request${reset}"
      echo "Creating feature request..."
      URL=$(gh issue create \
        --repo "$REPO" \
        --title "Add support for TOML config files" \
        --body "Would be great to support TOML in addition to JSON. Many Rust-adjacent teams prefer it." \
        2>&1 | grep -o 'https://github.com[^ ]*')
      echo -e "Created: ${cyan}${URL}${reset}"
      wait_and_open "$URL"
      ;;
    5)
      header
      echo -e "${green}Scene 5 — Hostile user${reset}"
      echo "Creating hostile/entitled issue..."
      URL=$(gh issue create \
        --repo "$REPO" \
        --title "This is BROKEN and you obviously don't care" \
        --body "I've been waiting 3 months! This project is abandoned garbage! You obviously know about the bug. Just fix it!" \
        2>&1 | grep -o 'https://github.com[^ ]*')
      echo -e "Created: ${cyan}${URL}${reset}"
      echo -e "${yellow}→ Watch community agent rewrite the bot response to be calm${reset}"
      wait_and_open "$URL"
      ;;
    6)
      header
      echo -e "${green}Scene 6 — Well-formed bug report${reset}"
      echo "Creating complete bug report..."
      URL=$(gh issue create \
        --repo "$REPO" \
        --title "Parser crashes on escaped spaces in config v2.1.1" \
        --body "## Version
2.1.1

## Environment
macOS 14.4, Node 20.11

## Reproduction steps
1. Create config with escaped space: \`key=\"hello\\ world\"\`
2. Run \`cabinet-demo parse --file config.json\`
3. Process crashes

## Expected behavior
Config parsed correctly, key set to \`hello world\`

## Actual behavior
\`TypeError: Cannot read properties of undefined at tokenize.ts:88\`" \
        2>&1 | grep -o 'https://github.com[^ ]*')
      echo -e "Created: ${cyan}${URL}${reset}"
      wait_and_open "$URL"
      ;;
    7)
      header
      echo -e "${green}Scene 7 — Slash: /cabinet triage${reset}"
      echo ""
      echo -ne "Issue number to comment on: "
      read -r ISSUE_NUM
      gh issue comment "$ISSUE_NUM" \
        --repo "$REPO" \
        --body "/cabinet triage"
      echo -e "${yellow}→ Cabinet will re-triage and post a new run${reset}"
      open "https://github.com/$REPO/issues/$ISSUE_NUM"
      ;;
    8)
      header
      echo -e "${green}Scene 8 — Slash: /cabinet release-plan${reset}"
      echo ""
      echo -ne "Issue number to post on: "
      read -r ISSUE_NUM
      gh issue comment "$ISSUE_NUM" \
        --repo "$REPO" \
        --body "/cabinet release-plan"
      echo -e "${yellow}→ Cabinet will draft a release plan from merged PRs${reset}"
      open "https://github.com/$REPO/issues/$ISSUE_NUM"
      ;;
    9)
      header
      echo -e "${green}Opening dashboard...${reset}"
      open "$DASHBOARD"
      ;;
    10)
      header
      echo -e "${green}Running evals...${reset}\n"
      cd "$(dirname "$0")/.." && source /Users/srijanshukla/.bashrc && pnpm eval
      ;;
    q|Q)
      echo "Bye."
      exit 0
      ;;
    *)
      echo -e "${yellow}Unknown option${reset}"
      ;;
  esac

  echo ""
  echo -ne "Press Enter to return to menu..."
  read -r
}

# if arg passed, run non-interactively
if [ -n "$1" ]; then
  run_scene "$1"
  exit 0
fi

# main loop
while true; do
  menu
  read -r choice
  run_scene "$choice"
done
