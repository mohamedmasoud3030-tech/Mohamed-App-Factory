import subprocess,re,sys,posixpath
sha=sys.argv[1]
files=set(subprocess.run(['git','ls-tree','-r','--name-only',sha],capture_output=True,text=True).stdout.split('\n'))
dirs=set(posixpath.dirname(f) for f in files); 
for f in list(dirs):
    while f: dirs.add(f); f=posixpath.dirname(f)
bad=0; n=0
for f in sorted(x for x in files if x.endswith('.md')):
    txt=subprocess.run(['git','show',f'{sha}:{f}'],capture_output=True,text=True).stdout
    txt=re.sub(r'```.*?```','',txt,flags=re.S)
    for m in re.finditer(r'\]\(([^)\s]+)\)',txt):
        t=m.group(1)
        if re.match(r'[a-z]+:',t) or t.startswith('#'): continue
        p=t.split('#')[0]; 
        if not p: continue
        tgt=posixpath.normpath(posixpath.join(posixpath.dirname(f),p)); n+=1
        if tgt not in files and tgt.rstrip('/') not in dirs: bad+=1; print(f'  BROKEN {f} -> {t}')
print(f'{sha}: {n} relative links checked, {bad} broken')
