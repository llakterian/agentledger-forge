#!/usr/bin/env bash
# Codegeist 2026 — AgentLedger demo recorder (deadline 22 Dec 2026, 12:00 PM PT)
#
# Usage:
#   ./record_demo.sh                 # record the screen for the full 3:30 script
#   ./record_demo.sh --cue           # only print the timed cue sheet (no recording)
#   ./record_demo.sh --minutes 4     # longer take
#   ./record_demo.sh --out FILE.mp4  # custom output path
#   ./record_demo.sh --audio nar.wav # mux a pre-recorded narration instead of the mic
#
# The demo itself is a Jira session: the AgentLedger issue panel, the Rovo
# agent and one MCP tool call. The cue sheet below is the shot list from
# submission/SUBMISSION.md; hit each beat at or after its timestamp so the
# final video stays under the 5-minute hard limit.

set -uo pipefail

DURATION_MIN=4
OUT="/home/c0bw3b/Proj/codegeist2026/agentledger-forge/submission/agentledger_demo_$(date +%Y%m%d_%H%M).mp4"
WAV=""
CUE_ONLY=0
GEOMETRY=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --minutes) DURATION_MIN="$2"; shift 2 ;;
    --out)     OUT="$2"; shift 2 ;;
    --audio)   WAV="$2"; shift 2 ;;
    --cue)     CUE_ONLY=1; shift ;;
    *) echo "unknown arg: $1"; exit 2 ;;
  esac
done

print_cues() {
cat <<'CUE'
────────────────────────────────────────────────────────────────────────
 AgentLedger demo — cue sheet (target 3:30, hard limit 5:00)
────────────────────────────────────────────────────────────────────────
0:00  Title card: "An agent acted on my issue. Who was it, was it allowed,
      and can I prove it?"  -> AgentLedger
0:20  Jira issue KAN-1 (Bugbounty Test). Issue header -> "View app actions"
      -> AgentLedger. The panel opens; "Agent identity" card appears.
0:35  The reference JyP9X278CKWoNLAFg5kVr is already prefilled. Press Verify.
0:55  Registry checks tick in: on-chain agent found, status active, agent URI
      present, card fetched, card hash matches, badge present, owner matches,
      extension conformant. Point out that BotIn #1190 is Concordium #1190.
1:25  Expand "Action policy". refund / close / approve are marked
      "human approval required"; comment / triage / transition are not.
1:50  Record -> "Comment on an issue"  => verdict ALLOWED, trail gains an entry.
2:05  Record -> "Trigger a refund / payout" => verdict FLAGGED (human-gated).
2:25  Rovo: open the "AgentLedger Auditor" agent in Jira, ask
      "Show the attestation trail for this issue" -> answers from the trail.
2:50  MCP: call "Work item context" for KAN-1 -> work item, goals, comments.
3:10  Back to the panel: chain intact, head hash shown, summary counts.
3:25  Title card: "AgentLedger — verifiable identity, human-gated authority,
      and a trail you can check. Built on Forge."
────────────────────────────────────────────────────────────────────────
CUE
}

if [[ "$CUE_ONLY" == "1" ]]; then
  print_cues
  exit 0
fi

command -v ffmpeg >/dev/null || { echo "ERROR: ffmpeg not installed"; exit 1; }

if [[ -z "$GEOMETRY" ]]; then
  GEOMETRY="$(xrandr 2>/dev/null | awk '/\*/ {print $1; exit}')"
  GEOMETRY="${GEOMETRY:-1366x768}"
fi
export DISPLAY="${DISPLAY:-:0}"
FPS=30
DURATION_SEC="$(awk "BEGIN{printf \"%d\", ${DURATION_MIN}*60}")"

echo "==> screen: $GEOMETRY @ ${FPS}fps (native — this laptop has no 1080p panel)"
echo "==> target length: ${DURATION_MIN} min -> $OUT"
print_cues
echo "==> recording in 5 seconds..."
sleep 5

if [[ -n "$WAV" ]]; then
  echo "==> muxing pre-recorded narration: $WAV"
  ffmpeg -y -f x11grab -framerate "$FPS" -video_size "$GEOMETRY" -i "$DISPLAY.0" \
         -i "$WAV" \
         -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p \
         -c:a aac -b:a 160k -ac 2 -shortest "$OUT"
else
  ffmpeg -y -f x11grab -framerate "$FPS" -video_size "$GEOMETRY" -i "$DISPLAY.0" \
         -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p \
         -t "$DURATION_SEC" "$OUT"
fi

echo "==> done: $OUT"
ls -lh "$OUT" 2>/dev/null
echo "==> sanity: duration / streams"
ffprobe -v error -show_entries format=duration,size \
        -show_entries stream=codec_name,width,height \
        -of default=noprint_wrappers=1 "$OUT" 2>/dev/null

cat <<'NEXT'
────────────────────────────────────────────────────────────────────────
 Next:
   1. ffprobe the file above — it must be < 300 s (5 min hard limit).
   2. Upload to YouTube as PUBLIC (not unlisted):
        https://studio.youtube.com  ->  Create -> Upload videos
      Title: AgentLedger — verifiable identity and a tamper-evident trail
        for AI agents in Atlassian
      Description: see submission/SUBMISSION.md ("Description for YouTube").
      Visibility: Public.
   3. Copy the public URL into submission/SUBMISSION.md and the Devpost form.
────────────────────────────────────────────────────────────────────────
NEXT
