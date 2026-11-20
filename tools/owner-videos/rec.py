import sys, asyncio, os, shutil, subprocess, time
from playwright.async_api import async_playwright
slugs = sys.argv[1].split(',')
mode = sys.argv[2] if len(sys.argv)>2 else 'video'
async def run(slug):
    async with async_playwright() as p:
        b = await p.chromium.launch()
        kw = dict(viewport={'width':780,'height':1848}, device_scale_factor=1)
        if mode=='video':
            kw.update(record_video_dir=f'raw_{slug}', record_video_size={'width':780,'height':1848})
        ctx = await b.new_context(**kw)
        pg = await ctx.new_page()
        t0=time.time()
        await pg.goto(f'file://{os.getcwd()}/app.html?v={slug}')
        if mode=='stills':
            for t in [float(x) for x in sys.argv[3].split(',')]:
                await asyncio.sleep(max(0,t-(time.time()-t0)))
                await pg.screenshot(path=f'still_{slug}_{int(t)}.jpg', quality=85)
        else:
            await pg.wait_for_function('window.done', timeout=180000, polling=200)
            await asyncio.sleep(0.6)
        dur=time.time()-t0
        await ctx.close(); await b.close()
        if mode=='video':
            src=[os.path.join(f'raw_{slug}',f) for f in os.listdir(f'raw_{slug}')][0]
            out=f'{slug}.tmp.mp4'
            subprocess.run(['ffmpeg','-y','-loglevel','error','-ss','0.5','-i',src,'-vf','fps=30,scale=780:1848,format=yuv420p','-c:v','libx264','-crf','20','-preset','veryfast','-movflags','+faststart','-an',out],check=True)
            os.rename(out,f'{slug}.mp4'); shutil.rmtree(f'raw_{slug}')
        print(slug, round(dur,1))
async def main():
    await asyncio.gather(*[run(s) for s in slugs])
asyncio.run(main())
