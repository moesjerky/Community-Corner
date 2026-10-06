#!/bin/zsh
# usage: tools/add_issue.sh <pdf> <issue#> <YYYY-MM-DD> ["Title"] ["Hebrew date"]
set -e; cd "$(dirname $0)/.."
mkdir -p issues/$2; cp "$1" issues/$2/issue.pdf; n=$(swift tools/render.swift "$1" issues/$2)
python3 - "$2" "$3" "$4" "$5" "$n" <<'PY'
import json,sys; a=sys.argv; L=json.load(open('issues.json'))
L=[i for i in L if i['num']!=int(a[1])]+[{"num":int(a[1]),"title":a[3],"date":a[2],"hebrew":a[4],"pages":int(a[5])}]
json.dump(sorted(L,key=lambda i:-i['num']),open('issues.json','w'),indent=1)
PY
echo "Added issue $2 ($n spreads)"
