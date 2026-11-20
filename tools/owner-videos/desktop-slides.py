from PIL import Image, ImageDraw, ImageFont
import subprocess, os
W,H=1568,668; CAP=130
F=ImageFont.truetype('/usr/share/fonts/opentype/inter/InterDisplay-Bold.otf',38) if os.path.exists('/usr/share/fonts/opentype/inter/InterDisplay-Bold.otf') else ImageFont.load_default()
F2=ImageFont.truetype('/usr/share/fonts/opentype/inter/InterDisplay-Medium.otf',34) if os.path.exists('/usr/share/fonts/opentype/inter/InterDisplay-Medium.otf') else F
GOLD=(201,162,39)
def frame(img, n, text, box=None, name='f'):
    c=Image.new('RGB',(W,H+CAP),(13,13,12)); d=ImageDraw.Draw(c)
    d.rectangle([0,CAP-6,W,CAP],fill=GOLD)
    d.ellipse([30,32,90,92],fill=GOLD); d.text((60,62),str(n),font=F,fill=(13,13,12),anchor='mm')
    d.text((115,62),text,font=F,fill='white',anchor='lm')
    if img:
        c.paste(Image.open(img),(0,CAP))
        if box:
            x0,y0,x1,y1=box; 
            for i in range(6): d.rounded_rectangle([x0-i-4,y0+CAP-i-4,x1+i+4,y1+CAP+i+4],radius=10,outline=GOLD)
    c.save(name)
def slide(n,title,lines,name):
    c=Image.new('RGB',(W,H+CAP),(13,13,12)); d=ImageDraw.Draw(c)
    d.rectangle([0,CAP-6,W,CAP],fill=GOLD)
    d.ellipse([30,32,90,92],fill=GOLD); d.text((60,62),str(n),font=F,fill=(13,13,12),anchor='mm')
    d.text((115,62),title,font=F,fill='white',anchor='lm')
    y=230
    for l in lines: d.text((120,y),l,font=F2,fill=(230,225,210)); y+=70
    c.save(name)
frame('dash.jpg',1,'On a computer, log in to app.gohighlevel.com, then click Settings',(8,628,150,658),'s1.png')
frame('settings.jpg',2,'Click Integrations',(6,496,150,522),'s2.png')
frame('integ.jpg',3,'Facebook: click Connect',(881,255,1180,283),'s3.png')
slide(4,'A Facebook window opens',['• Log in with the Facebook account that runs your business page','• Pick the Cruz Construction page','• Click Continue / Allow on every screen','• Back in GoHighLevel, select your page and save'],'s4.png')
frame('integ.jpg',5,'Instagram: click Connect, log in, pick your business account',(545,603,843,631),'s5.png')
slide(6,'Done!',['Facebook and Instagram messages now show up','in Conversations on your phone, with your texts.','','Tip: Instagram must be a Business account linked to your Facebook page.','Stuck? Text Visar: (888) 277-3619'],'s6.png')
durs=[5,4,4,8,6,7]
parts=[]
for i,d in enumerate(durs,1):
    out=f'p{i}.mp4'
    subprocess.run(['ffmpeg','-v','error','-y','-framerate','30','-i',f's{i}.png','-vf',f'scale=1568:798,format=yuv420p,loop=-1:1,trim=duration={d},fade=t=in:st=0:d=0.3','-c:v','libx264','-crf','20','-preset','veryfast','-pix_fmt','yuv420p',out],check=True)
    parts.append(out)
open('list.txt','w').write(''.join(f"file '{p}'\n" for p in parts))
subprocess.run(['ffmpeg','-v','error','-y','-f','concat','-safe','0','-i','list.txt','-c','copy','-movflags','+faststart','connect-fb-ig.tmp.mp4'],check=True)
os.rename('connect-fb-ig.tmp.mp4','connect-fb-ig.mp4')
