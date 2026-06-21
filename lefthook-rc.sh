#!/bin/sh
# Sourced by the installed lefthook hook before it runs, so ORG_HOOKS is
# available to all org-hooks command subprocesses.
export ORG_HOOKS=/home/john/src/org-hooks
. "$ORG_HOOKS/rc.sh"
