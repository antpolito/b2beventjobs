import base64
def b(p): return base64.b64encode(open(p,'rb').read()).decode()
ff=lambda fam,w,f: "@font-face{font-family:'%s';font-weight:%s;font-style:normal;font-display:block;src:url(data:font/woff2;base64,%s) format('woff2')}"%(fam,w,b(f))
css="\n".join([ff('Space Grotesk','300 700','templates/fonts/spacegrotesk.woff2'),ff('Plus Jakarta Sans','200 800','templates/fonts/jakarta.woff2'),ff('IBM Plex Mono','500','templates/fonts/plexmono500.woff2'),ff('IBM Plex Mono','600','templates/fonts/plexmono600.woff2')])
s=open('templates/stories.src.html').read().replace('/*FONTS*/',css)
open('templates/stories.html','w').write(s); print(len(s))
