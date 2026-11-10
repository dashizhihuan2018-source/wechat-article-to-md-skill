// Behavioral reproduction of the reviewed Obsync mini-program v13 reader.
// Trace and differences are documented in references/reverse-evidence.md.
const {JSDOM} = require('jsdom');
const Turndown = require('turndown');
const compact = s => s.replace(/\s+/g, ' ').trim();
const NAV_EXACT = /^(在小说阅读器读本章|去阅读|在小说阅读器中沉浸阅读|阅读原文|点击阅读原文|继续阅读|推荐阅读|相关推荐|更多精彩)$/i;
const NAV_PART = /小说阅读器|在小说阅读器|去阅读|沉浸阅读|阅读原文|继续阅读|推荐阅读|相关推荐|更多精彩/;
const REMOVALS = ['script','style','noscript','.qr_code_pc','.qr_code_preview','.rich_media_tool','.rich_media_meta_list','.rich_media_title','.rich_media_footer','.js_sponsor_container','.js_ad_link','.js_read_area','.js_bottom_ad_area','.recommend_box','.recommend_list','.weui-footer','#js_tags','#js_like_area','#js_profile_qrcode','#js_bottom_ad_area','figcaption'];
const IMAGE_ANCESTORS = '.qr_code_pc, .qr_code_preview, .rich_media_tool, .rich_media_footer, .js_sponsor_container, .js_ad_link, .js_read_area, .js_bottom_ad_area, .recommend_box, .recommend_list, .weui-footer, #js_tags, #js_like_area, #js_profile_qrcode, #js_bottom_ad_area';
const imageSource = el => el.getAttribute('data-src') ?? el.getAttribute('data-original') ?? el.getAttribute('src') ?? '';
function clean(root) {
  for (const selector of REMOVALS) root.querySelectorAll(selector).forEach(el => el.remove());
  root.querySelectorAll('p, div, section, article, aside, span, a, li').forEach(el => {
    const text = compact(el.textContent || '');
    if (text && (NAV_EXACT.test(text) || (NAV_PART.test(text) && (el.children.length <= 2 || text.length <= 28)))) el.remove();
  });
  root.querySelectorAll('img').forEach(el => {
    const src = imageSource(el);
    const ids = [el,el.parentElement,el.parentElement?.parentElement].filter(Boolean).map(n=>`${n.id} ${n.className}`).join(' ');
    if (!src || /^data:image\/(?:svg\+xml|gif);base64,/i.test(src) || el.closest(IMAGE_ANCESTORS) || /(?:^|[_\s-])(qr|qrcode|sponsor|advert|reward|recommend|related|profile|footer)(?:[_\s-]|$)/i.test(ids)) el.remove();
  });
  return root.innerHTML.trim();
}
function readableHtml(html) {
  const text = compact(html.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' '));
  return text.length >= 20 || (html.match(/<img[\s>]/gi)||[]).length >= 1;
}
function failed(url,title,error) {
  return {title:title?.trim() || '未解析公众号文章',markdown:`解析失败：${error}\n\n原文链接：${url}\n`,parseStatus:'failed',parseError:error};
}
function parse(html,url,title) {
  let dom;
  try {
    dom = new JSDOM(html,{url}); // No scripts or remote resources are enabled.
    const doc = dom.window.document;
    let body;
    for (const selector of ['#js_content','.rich_media_content','#img-content']) {
      const node = doc.querySelector(selector);
      const candidate = node ? clean(node.cloneNode(true)) : '';
      if (candidate && readableHtml(candidate)) { body=candidate; break; }
    }
    if (!body) throw Error('Readability returned no article content');
    const meta = key => doc.querySelector(`meta[property="${key}"]`)?.getAttribute('content') ?? doc.querySelector(`meta[name="${key}"]`)?.getAttribute('content') ?? undefined;
    const parsedTitle = compact(meta('og:title') ?? doc.querySelector('#activity-name')?.textContent ?? title ?? '未命名公众号文章');
    const account = compact(doc.querySelector('#js_name')?.textContent ?? meta('og:article:author') ?? meta('author') ?? '') || undefined;
    const author = compact(doc.querySelector('#meta_content .rich_media_meta_text')?.textContent ?? '') || undefined;
    const publishedAt = compact(doc.querySelector('#publish_time')?.textContent ?? '') || undefined;
    const td = new Turndown({headingStyle:'atx',codeBlockStyle:'fenced',bulletListMarker:'-'});
    td.addRule('wechatImages',{filter:'img',replacement:(_,node)=>{
      const src = imageSource(node);
      let resolved='';
      if (src) { try { resolved=new URL(src,url).toString(); } catch { resolved=src; } }
      return resolved ? `![${node.getAttribute('alt') ?? ''}](${resolved})` : '';
    }});
    const markdown = td.turndown(body).trim().split(/\r?\n/).filter(line=>{
      const text = compact(line.replace(/!\[[^\]]*\]\([^)]*\)/g,'').replace(/\[([^\]]*)\]\([^)]*\)/g,'$1').replace(/[#>*_`~-]/g,''));
      return !text || !NAV_EXACT.test(text);
    }).join('\n').replace(/\n{3,}/g,'\n\n').trim();
    const text = compact(markdown.replace(/!\[[^\]]*\]\([^)]*\)/g,'').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/[#>*_`~-]/g,' '));
    const imageCount = (markdown.match(/!\[[^\]]*\]\([^)]*\)/g)||[]).length;
    if (!(text.length >= 60 || (text.length >= 20 && imageCount >= 2))) throw Error('Article body is incomplete');
    return {title:parsedTitle,account,author,publishedAt,markdown:`${markdown}\n\n---\n原文链接：${url}\n`,excerpt:undefined,parseStatus:'ok'};
  } catch (error) { return failed(url,title,error instanceof Error ? error.message : 'Unknown parse error'); }
  finally { dom?.window.close(); }
}
module.exports={parse,failed};
