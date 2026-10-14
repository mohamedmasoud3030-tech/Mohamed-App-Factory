import json,sys,re
for f in sys.argv[1:]:
    d=json.load(open(f)); pg=[a['status'] for t in d['testResults'] if 'runtime-role.pg' in t['name'] for a in t['assertionResults']]
    print(f.split('out/')[-1], 'total',d['numTotalTests'],'passed',d['numPassedTests'],'failed',d['numFailedTests'],'skipped',d['numPendingTests'],'| runtime-role.pg:',{s:pg.count(s) for s in set(pg)})
