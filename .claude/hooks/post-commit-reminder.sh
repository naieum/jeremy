#!/bin/bash
# Remind user to sync project docs after git commits

input=$(cat)
tool_name=$(echo "$input" | jq -r '.tool_name // ""')
command=$(echo "$input" | jq -r '.tool_input.command // ""')

# Only trigger on Bash tool calls that contain "git commit"
if [ "$tool_name" != "Bash" ]; then
  exit 0
fi

if ! echo "$command" | grep -q 'git commit'; then
  exit 0
fi

echo '{"message":"Tip: If you made significant code changes, consider running sync-project-docs to keep your project documentation up to date on Jeremy."}'
exit 0
