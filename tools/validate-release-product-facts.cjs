'use strict';
// Independent saved-DOM assertions. Does not import the browser presentation code.
const {descendants,textContent,hasClass,visible,requireCondition:check}=require('./static-html-readonly-lib.cjs');
const text=n=>textContent(n).trim(),eq=(a,b,m)=>check(JSON.stringify(a)===JSON.stringify(b),m);
function validateProductFacts(edition,groups){
  const lists=descendants(edition,n=>Object.hasOwn(n.attrs,'data-product-facts'));
  eq(lists.map(n=>n.attrs['data-product-facts']),groups.filter(g=>g.rows.length).map(g=>g.name),'Product fact categories/order');
  for(const group of groups.filter(g=>g.rows.length)){
    const list=lists.find(n=>n.attrs['data-product-facts']===group.name),members=descendants(list,n=>Object.hasOwn(n.attrs,'data-product-fact'));
    check(list.tag==='ul'&&hasClass(list,'release-single-facts')&&list.children.filter(n=>typeof n==='string').every(n=>!n.trim()),'Product fact list semantics');
    const expected=group.rows.map(r=>r.text==='Memorial BOX Ⅰに同梱されたCD。単売版との音源同一性は未確認。'?'Memorial BOX Ⅰに同梱されたCD。':r.text);
    eq(members.map(n=>n.attrs['data-product-fact']),expected.map((_,i)=>String(i)),'Product fact complete unique order');
    const recovered=members.map(n=>{
      check(visible(n)&&!Object.hasOwn(n.attrs,'aria-hidden'),'Product fact not hidden');
      if(n.tag==='li')return text(n);
      check(n.tag==='span'&&hasClass(n.parent,'release-product-fact-members')&&hasClass(n.parent.parent,'release-product-fact-group'),'Grouped fact semantics');
      const label=n.parent.parent.children.find(x=>typeof x!=='string'&&hasClass(x,'release-product-fact-label'));
      check(label&&label.tag==='span','Shared fact label');return text(label)+text(n);
    });
    eq(recovered,expected,'Every source fact retained in its own edition/category (approved internal clause excluded)');
    eq(members.map(n=>n.attrs['data-single-historical']==='true'),group.rows.map(r=>r.historical===true),'Historical scope preserved per fact');
    const roots=list.children.filter(n=>typeof n!=='string');
    for(const n of roots){
      check(n.tag==='li','Fact remains list item');
      if(Object.hasOwn(n.attrs,'data-product-fact'))check(!n.children.some(c=>typeof c!=='string'),'Plain fact has no extra hidden content');
      else {
        const parts=n.children.filter(c=>typeof c!=='string');check(hasClass(n,'release-product-fact-group')&&parts.length===2&&hasClass(parts[0],'release-product-fact-label')&&hasClass(parts[1],'release-product-fact-members'),'Shared label structure');
        const values=descendants(parts[1],x=>Object.hasOwn(x.attrs,'data-product-fact'));check(values.length>=2,'Grouping requires repeated label');
        eq(text(n),text(parts[0])+values.map(text).join('／'),'No hidden/deleted/extra grouped facts');
        check(/^(アニメーションショートフィルム|[^：]{2,40}：)$/.test(text(parts[0])),'Unambiguous common prefix only');
      }
    }
    // A repeated film label must appear once, never five times in the same list.
    const films=expected.filter(s=>s.startsWith('アニメーションショートフィルム「'));
    if(films.length>1)eq((text(list).match(/アニメーションショートフィルム/g)||[]).length,1,'Repeated film label consolidated');
    check(!/音源同一性は未確認|単売版との同一性は未確認|照合待ち|データ管理上の注記/.test(text(list)),'No internal management wording');
  }
}
module.exports={validateProductFacts};
