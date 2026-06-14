import { useState, useMemo } from "react";

/*
  PAPER EXCHANGE — desktop three-tab layout (DESIGN LOCK / mock data)
  ------------------------------------------------------------------
  Frontend design reference for the real build. Runs on MOCK data
  (seeded fake prices + history) so charts, trading, donut and
  leaderboard are all clickable.

  In the real (Claude Code) build the data layer gets swapped:
    MOCK_STOCKS / price history → Finnhub via Supabase Edge Function
    in-memory state             → Supabase Postgres (positions, trades)
    seeded leaderboard users    → real friends' rows from Supabase
    name on login               → Supabase Auth
  The UI / layout / logic below is what carries over.
*/

const C = {
  bg: "#F0F2F5", card: "#FFFFFF", ink: "#0D1117", dim: "#6B7585", muted: "#AEB6C2",
  line: "#E8EBF0", lineSoft: "#F0F2F5",
  green: "#0CAF71", greenSoft: "rgba(12,175,113,0.10)",
  red: "#E5484D", redSoft: "rgba(229,72,77,0.10)",
  blue: "#3B6FF5", amber: "#B8741A", amberSoft: "rgba(184,116,26,0.10)",
  mono: "'SF Mono','Menlo','Consolas',monospace",
  sans: "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
  sh: "0 1px 2px rgba(13,17,23,0.04), 0 2px 8px rgba(13,17,23,0.04)",
};

const START_CASH = 10000;
const DONUT = ["#0CAF71","#3B6FF5","#8B5CF6","#F59E0B","#EC4899","#06B6D4","#84CC16","#F97316"];

function mulberry32(a){return function(){a|=0;a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
function genSeries(seed,end,vol=0.018,drift=0.0006){const rnd=mulberry32(seed);const n=260;const arr=new Array(n);let p=end;for(let i=n-1;i>=0;i--){arr[i]=p;p=p/(1+drift+(rnd()-0.5)*vol*2);}return arr.map(v=>+v.toFixed(2));}

const MOCK_STOCKS = {
  NVDA:{name:"NVIDIA Corporation",price:1037.89,mcap:"2.56T",pe:64.2,seed:11},
  AAPL:{name:"Apple Inc.",price:196.42,mcap:"3.01T",pe:33.1,seed:22},
  MSFT:{name:"Microsoft Corp.",price:445.68,mcap:"3.31T",pe:38.4,seed:33},
  GOOGL:{name:"Alphabet Inc.",price:168.58,mcap:"2.08T",pe:27.5,seed:44},
  AMZN:{name:"Amazon.com Inc.",price:198.51,mcap:"2.05T",pe:44.0,seed:55},
  TSLA:{name:"Tesla, Inc.",price:178.91,mcap:"569B",pe:71.8,seed:66},
  AVGO:{name:"Broadcom Inc.",price:1642.30,mcap:"762B",pe:58.9,seed:77},
  TSM:{name:"TSMC",price:174.22,mcap:"903B",pe:29.7,seed:88},
  ORCL:{name:"Oracle Corp.",price:142.11,mcap:"391B",pe:36.2,seed:99},
  SPY:{name:"SPDR S&P 500 ETF",price:612.78,mcap:"—",pe:26.1,seed:111},
};
Object.values(MOCK_STOCKS).forEach(s=>{s.series=genSeries(s.seed,s.price);});
const WATCH = ["NVDA","AAPL","MSFT","GOOGL","AMZN","TSLA","AVGO","TSM","ORCL","SPY"];
const TIMEFRAMES = [["1W",5],["1M",22],["3M",66],["1Y",252],["MAX",260]];
const MOCK_USERS = [
  {username:"InvestWizard",value:12543.07,ret:25.43,seed:201},
  {username:"MarketMaster99",value:11823.48,ret:18.23,seed:202},
  {username:"BullishBen",value:11280.04,ret:12.80,seed:203},
  {username:"GreenGraph",value:10676.52,ret:6.77,seed:204},
  {username:"TradeTitan",value:10542.83,ret:5.43,seed:205},
  {username:"AlphaAce",value:10120.99,ret:1.21,seed:206},
  {username:"DataDriven",value:9783.22,ret:-2.17,seed:207},
  {username:"ValueHunter",value:9011.47,ret:-9.89,seed:209},
];

const fmt=(n,dp=2)=>(n??0).toLocaleString("en-GB",{minimumFractionDigits:dp,maximumFractionDigits:dp});
const P=n=>`P£${fmt(n)}`;
const pct=n=>`${n>=0?"+":""}${fmt(n)}%`;
function userColor(name=""){const pal=["#6366F1","#EC4899","#14B8A6","#F59E0B","#84CC16","#8B5CF6","#F97316","#06B6D4"];let h=0;for(const c of name)h=(h*31+c.charCodeAt(0))&0xffff;return pal[h%pal.length];}

export default function PaperExchange(){
  const [tab,setTab]=useState("market");
  const [search,setSearch]=useState("");
  const [active,setActive]=useState("NVDA");
  const [tf,setTf]=useState("1Y");
  const [tradeMode,setTradeMode]=useState("cash");
  const [tradeAmt,setTradeAmt]=useState("");
  const [msg,setMsg]=useState(null);
  const [selUser,setSelUser]=useState("InvestWizard");
  const [cash,setCash]=useState(2130.45);
  const [positions,setPositions]=useState({
    NVDA:{shares:15,avgCost:1045.26},AAPL:{shares:20,avgCost:190.02},
    MSFT:{shares:15,avgCost:443.90},GOOGL:{shares:10,avgCost:175.00},TSLA:{shares:8,avgCost:160.00},
  });
  const [trades,setTrades]=useState([]);

  const stock=MOCK_STOCKS[active];
  const totalValue=useMemo(()=>{let v=cash;Object.entries(positions).forEach(([t,p])=>{v+=p.shares*(MOCK_STOCKS[t]?.price??p.avgCost);});return v;},[cash,positions]);
  const totalPL=totalValue-START_CASH;
  const allocation=useMemo(()=>{const items=Object.entries(positions).map(([t,p],i)=>({ticker:t,name:MOCK_STOCKS[t]?.name??t,value:p.shares*(MOCK_STOCKS[t]?.price??p.avgCost),color:DONUT[i%DONUT.length]}));items.push({ticker:"CASH",name:"Cash",value:cash,color:"#CBD2DC"});items.sort((a,b)=>b.value-a.value);return items;},[positions,cash]);

  function searchOpen(sym){const t=sym.trim().toUpperCase();if(MOCK_STOCKS[t]){setActive(t);setSearch("");setTab("market");setMsg(null);}else if(t)setMsg({kind:"err",text:`${t} isn't in the demo set. Try NVDA, AAPL, MSFT, GOOGL, AMZN, TSLA, AVGO, TSM, ORCL, SPY.`});}

  function trade(side){
    const price=stock.price;const amt=parseFloat(tradeAmt);
    if(!amt||amt<=0)return setMsg({kind:"err",text:"Enter an amount first."});
    const shares=tradeMode==="cash"?amt/price:amt;const cost=shares*price;
    if(side==="buy"){
      if(cost>cash+1e-9)return setMsg({kind:"err",text:`Not enough cash — you have ${P(cash)}.`});
      const pos=positions[active]||{shares:0,avgCost:0};const ns=pos.shares+shares;const na=(pos.shares*pos.avgCost+cost)/ns;
      setCash(c=>c-cost);setPositions(ps=>({...ps,[active]:{shares:ns,avgCost:na}}));
    }else{
      const pos=positions[active];if(!pos||pos.shares<shares-1e-9)return setMsg({kind:"err",text:`You hold ${pos?fmt(pos.shares,4):0} ${active}.`});
      const rem=pos.shares-shares;setCash(c=>c+cost);
      setPositions(ps=>{const n={...ps};if(rem<1e-7)delete n[active];else n[active]={...pos,shares:rem};return n;});
    }
    setTrades(t=>[{side,ticker:active,shares,price,value:cost,ts:Date.now()},...t].slice(0,50));
    setTradeAmt("");setMsg({kind:"ok",text:`${side==="buy"?"Bought":"Sold"} ${fmt(shares,4)} ${active} at ${P(price)} — ${P(cost)} total.`});
  }

  return (
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:C.sans,color:C.ink}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        *,*::before,*::after{box-sizing:border-box}
        button{cursor:pointer;font-family:inherit}
        .lift{transition:transform .18s cubic-bezier(.25,.46,.45,.94),box-shadow .18s}
        .lift:hover{transform:translateY(-2px);box-shadow:0 10px 30px rgba(13,17,23,.12)!important}
        .nav-tab{position:relative;transition:color .15s}
        .nav-tab:hover{color:${C.ink}!important}
        .wrow{transition:background .12s}
        .wrow:hover{background:${C.lineSoft}!important}
        .btn{transition:transform .14s cubic-bezier(.34,1.56,.64,1),filter .12s,opacity .15s}
        .btn:not(:disabled):hover{transform:scale(1.04)}
        .btn:not(:disabled):active{transform:scale(.97)}
        .trbtn{transition:transform .14s cubic-bezier(.34,1.56,.64,1),filter .12s}
        .trbtn:hover{transform:scale(1.02);filter:brightness(1.08)}
        .trbtn:active{transform:scale(.98)}
        .tfbtn{transition:background .12s,color .12s}
        .tfbtn:hover{background:rgba(13,17,23,.05)}
        .pi{transition:border-color .15s,box-shadow .15s}
        .pi:focus{outline:none;border-color:${C.ink}!important;box-shadow:0 0 0 3px rgba(13,17,23,.07)}
      `}</style>

      {/* top nav */}
      <div style={{background:C.card,borderBottom:`1px solid ${C.line}`,position:"sticky",top:0,zIndex:20}}>
        <div style={{maxWidth:1180,margin:"0 auto",padding:"0 24px",height:64,display:"flex",alignItems:"center",gap:24}}>
          <div style={{display:"flex",alignItems:"center",gap:9,fontWeight:800,fontSize:17,letterSpacing:"-0.02em"}}>
            <div style={{width:26,height:26,borderRadius:8,background:`linear-gradient(135deg,${C.blue},#6366F1)`}}/>
            PaperExchange
          </div>
          <div style={{display:"flex",gap:4,marginLeft:18}}>
            {[["market","Market"],["portfolio","Portfolio"],["board","Leaderboard"]].map(([k,l])=>(
              <button key={k} onClick={()=>setTab(k)} className="nav-tab" style={{background:"none",border:"none",padding:"8px 14px",fontSize:14.5,fontWeight:tab===k?700:500,color:tab===k?C.ink:C.dim}}>
                {l}{tab===k&&<div style={{position:"absolute",left:14,right:14,bottom:-21,height:2.5,background:C.blue,borderRadius:2}}/>}
              </button>
            ))}
          </div>
          <div style={{flex:1}}/>
          <div style={{position:"relative",width:300}}>
            <span style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",color:C.muted,fontSize:14}}>⌕</span>
            <input value={search} onChange={e=>setSearch(e.target.value.toUpperCase())} onKeyDown={e=>e.key==="Enter"&&searchOpen(search)} placeholder="Search stocks, ETFs, more…" className="pi" style={{width:"100%",padding:"9px 14px 9px 34px",fontSize:13.5,background:C.bg,color:C.ink,border:`1px solid ${C.line}`,borderRadius:12}}/>
          </div>
          <Avatar name="You" size={32} ring/>
        </div>
      </div>

      <div style={{maxWidth:1180,margin:"0 auto",padding:24}}>
        {msg&&<div style={{padding:"11px 16px",borderRadius:12,marginBottom:18,fontSize:13.5,fontWeight:500,display:"flex",alignItems:"center",gap:9,background:msg.kind==="ok"?C.greenSoft:C.redSoft,color:msg.kind==="ok"?C.green:C.red,border:`1px solid ${msg.kind==="ok"?"rgba(12,175,113,.18)":"rgba(229,72,77,.18)"}`}}><span>{msg.kind==="ok"?"✓":"✕"}</span>{msg.text}</div>}

        {/* MARKET */}
        {tab==="market"&&(
          <div style={{display:"grid",gridTemplateColumns:"320px 1fr",gap:20,alignItems:"start"}}>
            <Panel pad={0}>
              <div style={{padding:"16px 20px",borderBottom:`1px solid ${C.line}`,fontWeight:700,fontSize:14}}>Market Overview</div>
              {WATCH.map(t=>{const s=MOCK_STOCKS[t];const chg=((s.price-s.series[s.series.length-2])/s.series[s.series.length-2])*100;const on=active===t;return(
                <div key={t} onClick={()=>setActive(t)} className="wrow" style={{display:"flex",alignItems:"center",gap:12,padding:"11px 18px",cursor:"pointer",borderLeft:`3px solid ${on?C.blue:"transparent"}`,background:on?"rgba(59,111,245,0.05)":"transparent"}}>
                  <Logo ticker={t} size={30}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:600,fontSize:13.5,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{s.name}</div>
                    <div style={{fontFamily:C.mono,fontSize:11,color:C.dim}}>{t}</div>
                  </div>
                  <MiniSpark series={s.series.slice(-30)} up={chg>=0}/>
                  <div style={{textAlign:"right",minWidth:64}}>
                    <div style={{fontFamily:C.mono,fontSize:12.5,fontWeight:700}}>{fmt(s.price)}</div>
                    <div style={{fontFamily:C.mono,fontSize:11,fontWeight:600,color:chg>=0?C.green:C.red}}>{pct(chg)}</div>
                  </div>
                </div>);})}
            </Panel>

            <Panel pad={26}>
              <div style={{display:"flex",alignItems:"flex-start",gap:16,marginBottom:20}}>
                <Logo ticker={active} size={46}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:21,fontWeight:800,letterSpacing:"-0.01em"}}>{stock.name}</div>
                  <div style={{fontFamily:C.mono,fontSize:12.5,color:C.dim,marginTop:1}}>{active}</div>
                </div>
                <button className="btn" style={{padding:"8px 18px",borderRadius:12,border:`1px solid ${C.line}`,background:C.card,fontWeight:600,fontSize:13.5,color:C.ink,boxShadow:C.sh}}>★ Watchlist</button>
              </div>
              {(()=>{const prev=stock.series[stock.series.length-2];const chg=stock.price-prev;const chgP=(chg/prev)*100;const up=chg>=0;return(
                <div style={{display:"flex",alignItems:"baseline",gap:14,marginBottom:8}}>
                  <span style={{fontFamily:C.mono,fontSize:40,fontWeight:900,letterSpacing:"-0.03em"}}>{P(stock.price)}</span>
                  <span style={{fontFamily:C.mono,fontSize:16,fontWeight:700,color:up?C.green:C.red}}>{up?"▲":"▼"} {fmt(Math.abs(chg))} ({pct(chgP)})</span>
                </div>);})()}
              <div style={{display:"flex",gap:2,margin:"16px 0 6px"}}>
                {TIMEFRAMES.map(([label])=>(
                  <button key={label} onClick={()=>setTf(label)} className="tfbtn" style={{padding:"6px 14px",fontSize:12.5,fontWeight:600,border:"none",borderRadius:8,fontFamily:C.mono,background:tf===label?"rgba(59,111,245,0.1)":"transparent",color:tf===label?C.blue:C.dim}}>{label}</button>
                ))}
              </div>
              <BigChart series={stock.series} count={TIMEFRAMES.find(t=>t[0]===tf)[1]}/>
              <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:14,margin:"20px 0 22px",paddingTop:18,borderTop:`1px solid ${C.line}`}}>
                {(()=>{const sl=stock.series.slice(-TIMEFRAMES.find(t=>t[0]===tf)[1]);return[["Open",fmt(stock.series[stock.series.length-2])],["High",fmt(Math.max(...sl))],["Low",fmt(Math.min(...sl))],["Prev close",fmt(stock.series[stock.series.length-2])],["Mkt cap",stock.mcap],["P/E ratio",fmt(stock.pe)]];})().map(([l,v])=>(
                  <div key={l}><div style={{fontSize:11.5,color:C.dim,marginBottom:3}}>{l}</div><div style={{fontFamily:C.mono,fontSize:14,fontWeight:700}}>{v}</div></div>
                ))}
              </div>
              <div style={{background:C.bg,borderRadius:16,padding:18}}>
                {positions[active]&&<div style={{fontFamily:C.mono,fontSize:12,color:C.dim,marginBottom:14}}>Holding {fmt(positions[active].shares,4)} sh · avg {P(positions[active].avgCost)} · position {P(positions[active].shares*stock.price)}</div>}
                <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                  <div style={{display:"flex",background:C.card,borderRadius:999,padding:4,border:`1px solid ${C.line}`}}>
                    {[["cash","P£"],["shares","Shares"]].map(([k,l])=>(
                      <button key={k} onClick={()=>setTradeMode(k)} style={{padding:"6px 14px",fontSize:12.5,fontWeight:600,border:"none",borderRadius:999,background:tradeMode===k?C.ink:"transparent",color:tradeMode===k?"#fff":C.dim}}>{l}</button>
                    ))}
                  </div>
                  <input value={tradeAmt} onChange={e=>setTradeAmt(e.target.value.replace(/[^0-9.]/g,""))} placeholder={tradeMode==="cash"?"Amount, e.g. 500":"Shares, e.g. 2.5"} inputMode="decimal" className="pi" style={{flex:1,minWidth:140,padding:"11px 15px",fontSize:15,fontFamily:C.mono,background:C.card,border:`1px solid ${C.line}`,borderRadius:12}}/>
                  <button onClick={()=>trade("sell")} className="trbtn" style={{padding:"11px 26px",fontSize:14.5,fontWeight:800,border:"none",borderRadius:12,background:C.red,color:"#fff",boxShadow:"0 3px 14px rgba(229,72,77,0.28)"}}>Sell</button>
                  <button onClick={()=>trade("buy")} className="trbtn" style={{padding:"11px 26px",fontSize:14.5,fontWeight:800,border:"none",borderRadius:12,background:C.green,color:"#fff",boxShadow:"0 3px 14px rgba(12,175,113,0.28)"}}>Buy</button>
                </div>
                {tradeAmt&&<div style={{fontFamily:C.mono,fontSize:12,color:C.dim,marginTop:10}}>≈ {tradeMode==="cash"?`${fmt(parseFloat(tradeAmt||0)/stock.price,4)} shares`:P(parseFloat(tradeAmt||0)*stock.price)} · {P(cash)} cash available</div>}
              </div>
            </Panel>
          </div>
        )}

        {/* PORTFOLIO */}
        {tab==="portfolio"&&(
          <div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1.3fr",gap:20,marginBottom:20,alignItems:"start"}}>
              <Panel pad={24}>
                <div style={{fontWeight:700,fontSize:14,marginBottom:18}}>Portfolio Overview</div>
                <div style={{fontSize:12.5,color:C.dim,marginBottom:4}}>Total Value</div>
                <div style={{fontFamily:C.mono,fontSize:36,fontWeight:900,letterSpacing:"-0.03em",marginBottom:6}}>{P(totalValue)}</div>
                <div style={{fontFamily:C.mono,fontSize:13.5,fontWeight:700,color:totalPL>=0?C.green:C.red,marginBottom:22}}>{totalPL>=0?"▲":"▼"} {P(Math.abs(totalPL))} ({pct((totalPL/START_CASH)*100)})</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
                  <Stat label="Cash Balance" value={P(cash)}/>
                  <Stat label="Invested" value={P(totalValue-cash)}/>
                </div>
              </Panel>
              <Panel pad={24}>
                <div style={{fontWeight:700,fontSize:14,marginBottom:16}}>Performance</div>
                <BigChart series={genSeries(7,totalValue,0.01,0.0011)} count={66} height={150} forceUp/>
              </Panel>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"360px 1fr",gap:20,alignItems:"start"}}>
              <Panel pad={24}>
                <div style={{fontWeight:700,fontSize:14,marginBottom:18}}>Allocation</div>
                <div style={{display:"flex",alignItems:"center",gap:18}}>
                  <Donut items={allocation} total={totalValue}/>
                  <div style={{flex:1,display:"flex",flexDirection:"column",gap:8}}>
                    {allocation.map(a=>(
                      <div key={a.ticker} style={{display:"flex",alignItems:"center",gap:8,fontSize:12.5}}>
                        <span style={{width:9,height:9,borderRadius:3,background:a.color,flexShrink:0}}/>
                        <span style={{flex:1,fontWeight:500,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{a.ticker}</span>
                        <span style={{fontFamily:C.mono,color:C.dim}}>{fmt((a.value/totalValue)*100,1)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Panel>
              <Panel pad={0}>
                <div style={{padding:"18px 22px 12px",fontWeight:700,fontSize:14}}>Holdings</div>
                <div style={{display:"grid",gridTemplateColumns:"1.6fr .8fr .9fr .9fr 1fr .9fr",gap:8,padding:"0 22px 10px",fontSize:11,color:C.dim,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.04em",borderBottom:`1px solid ${C.line}`}}>
                  <span>Symbol</span><span style={{textAlign:"right"}}>Shares</span><span style={{textAlign:"right"}}>Avg</span><span style={{textAlign:"right"}}>Price</span><span style={{textAlign:"right"}}>Value</span><span style={{textAlign:"right"}}>Total %</span>
                </div>
                {Object.entries(positions).map(([t,p])=>{const px=MOCK_STOCKS[t]?.price??p.avgCost;const val=p.shares*px;const plP=((px-p.avgCost)/p.avgCost)*100;return(
                  <div key={t} onClick={()=>{setActive(t);setTab("market");}} className="wrow" style={{display:"grid",gridTemplateColumns:"1.6fr .8fr .9fr .9fr 1fr .9fr",gap:8,padding:"13px 22px",alignItems:"center",cursor:"pointer",borderBottom:`1px solid ${C.lineSoft}`,fontFamily:C.mono,fontSize:13}}>
                    <span style={{display:"flex",alignItems:"center",gap:10,fontFamily:C.sans}}>
                      <Logo ticker={t} size={28}/>
                      <span><b style={{fontSize:13.5}}>{t}</b><br/><span style={{fontSize:11,color:C.dim}}>{MOCK_STOCKS[t]?.name}</span></span>
                    </span>
                    <span style={{textAlign:"right"}}>{fmt(p.shares,2)}</span>
                    <span style={{textAlign:"right",color:C.dim}}>{fmt(p.avgCost)}</span>
                    <span style={{textAlign:"right"}}>{fmt(px)}</span>
                    <span style={{textAlign:"right",fontWeight:700}}>{fmt(val)}</span>
                    <span style={{textAlign:"right",color:plP>=0?C.green:C.red,fontWeight:600}}>{pct(plP)}</span>
                  </div>);})}
                <div style={{display:"grid",gridTemplateColumns:"1.6fr .8fr .9fr .9fr 1fr .9fr",gap:8,padding:"13px 22px",alignItems:"center",fontFamily:C.mono,fontSize:13}}>
                  <span style={{display:"flex",alignItems:"center",gap:10,fontFamily:C.sans}}>
                    <span style={{width:28,height:28,borderRadius:8,background:C.amberSoft,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>💷</span>
                    <b style={{fontSize:13.5}}>Cash</b>
                  </span>
                  <span/><span/><span/><span style={{textAlign:"right",fontWeight:700}}>{fmt(cash)}</span><span/>
                </div>
              </Panel>
            </div>
          </div>
        )}

        {/* LEADERBOARD */}
        {tab==="board"&&(()=>{
          const me={username:"You",value:totalValue,ret:(totalPL/START_CASH)*100,seed:300};
          const rows=[...MOCK_USERS,me].sort((a,b)=>b.value-a.value);
          const sel=rows.find(r=>r.username===selUser)||rows[0];
          return(
            <div style={{display:"grid",gridTemplateColumns:"1fr 380px",gap:20,alignItems:"start"}}>
              <Panel pad={0}>
                <div style={{display:"grid",gridTemplateColumns:"48px 1fr 1fr 1fr",gap:8,padding:"16px 22px 12px",fontSize:11,color:C.dim,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.04em",borderBottom:`1px solid ${C.line}`}}>
                  <span>Rank</span><span>Trader</span><span style={{textAlign:"right"}}>Value</span><span style={{textAlign:"right"}}>Return</span>
                </div>
                {rows.map((r,i)=>{const isMe=r.username==="You";const medals=["🥇","🥈","🥉"];const on=selUser===r.username;return(
                  <div key={r.username} onClick={()=>setSelUser(r.username)} className="wrow" style={{display:"grid",gridTemplateColumns:"48px 1fr 1fr 1fr",gap:8,padding:"13px 22px",alignItems:"center",cursor:"pointer",borderBottom:`1px solid ${C.lineSoft}`,background:on?"rgba(59,111,245,0.05)":isMe?"rgba(184,116,26,0.04)":"transparent"}}>
                    <span style={{fontSize:i<3?18:13,fontFamily:i>=3?C.mono:"inherit",color:C.muted,fontWeight:700}}>{i<3?medals[i]:i+1}</span>
                    <span style={{display:"flex",alignItems:"center",gap:10}}>
                      <Avatar name={r.username} size={30}/>
                      <span style={{fontWeight:isMe?800:600,fontSize:14}}>{r.username}</span>
                      {isMe&&<span style={{fontFamily:C.mono,fontSize:9,fontWeight:700,color:C.amber,padding:"2px 7px",borderRadius:999,background:C.amberSoft}}>YOU</span>}
                    </span>
                    <span style={{textAlign:"right",fontFamily:C.mono,fontWeight:700,fontSize:13.5}}>{P(r.value)}</span>
                    <span style={{textAlign:"right",fontFamily:C.mono,fontWeight:600,fontSize:13,color:r.ret>=0?C.green:C.red}}>{pct(r.ret)}</span>
                  </div>);})}
              </Panel>
              <Panel pad={24}>
                <div style={{display:"flex",alignItems:"center",gap:13,marginBottom:20}}>
                  <Avatar name={sel.username} size={48}/>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:800,fontSize:17}}>{sel.username}</div>
                    <div style={{fontSize:12.5,color:C.dim}}>Rank #{rows.findIndex(r=>r.username===sel.username)+1}</div>
                  </div>
                  <button className="btn" style={{padding:"8px 18px",borderRadius:12,border:"none",background:C.blue,color:"#fff",fontWeight:700,fontSize:13.5,boxShadow:"0 3px 12px rgba(59,111,245,0.3)"}}>Follow</button>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:20}}>
                  <Stat label="Portfolio Value" value={P(sel.value)}/>
                  <Stat label="All-Time Return" value={pct(sel.ret)} color={sel.ret>=0?C.green:C.red}/>
                </div>
                <div style={{fontSize:12,color:C.dim,fontWeight:600,marginBottom:8}}>Performance</div>
                <BigChart series={genSeries(sel.seed,sel.value,0.012,sel.ret>=0?0.0012:-0.0004)} count={66} height={130}/>
                <button className="btn" style={{width:"100%",marginTop:18,padding:"13px 0",borderRadius:14,border:`1px solid ${C.line}`,background:C.card,fontWeight:700,fontSize:14,color:C.ink,boxShadow:C.sh}}>View full portfolio →</button>
              </Panel>
            </div>
          );
        })()}
      </div>
      <div style={{textAlign:"center",padding:"0 0 40px",fontSize:11.5,color:C.muted,fontFamily:C.mono}}>Demo build · mock prices · for design review only</div>
    </div>
  );
}

function Panel({children,pad=20}){return <div style={{background:C.card,borderRadius:18,boxShadow:C.sh,padding:pad,border:`1px solid ${C.line}`}}>{children}</div>;}
function Stat({label,value,color}){return(<div style={{background:C.bg,borderRadius:12,padding:"12px 14px"}}><div style={{fontSize:11.5,color:C.dim,marginBottom:4}}>{label}</div><div style={{fontFamily:C.mono,fontSize:17,fontWeight:800,color:color||C.ink}}>{value}</div></div>);}
function Avatar({name,size=30,ring}){return(<div style={{width:size,height:size,borderRadius:"50%",background:userColor(name),color:"#fff",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:size*0.42,boxShadow:ring?`0 0 0 2px ${C.card},0 0 0 3.5px ${userColor(name)}`:"none"}}>{(name||"?")[0].toUpperCase()}</div>);}
function Logo({ticker,size=30}){const palette={NVDA:"#76B900",AAPL:"#111",MSFT:"#00A4EF",GOOGL:"#4285F4",AMZN:"#FF9900",TSLA:"#E82127",AVGO:"#CC092F",TSM:"#D6001C",ORCL:"#F80000",SPY:"#1B5E9E"};const bg=palette[ticker]||"#888";return(<div style={{width:size,height:size,borderRadius:size*0.28,background:bg,color:"#fff",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:size*0.36,fontFamily:C.sans}}>{ticker[0]}</div>);}
function MiniSpark({series,up}){const min=Math.min(...series),max=Math.max(...series),range=max-min||1;const w=46,h=22;const pts=series.map((v,i)=>`${(i/(series.length-1))*w},${h-((v-min)/range)*h}`).join(" ");return<svg width={w} height={h} style={{flexShrink:0}}><polyline points={pts} fill="none" stroke={up?C.green:C.red} strokeWidth="1.5" strokeLinejoin="round"/></svg>;}
function Donut({items,total}){
  const R=52,r=33,cx=64,cy=64;let a0=-Math.PI/2;
  const arcs=items.map(it=>{const frac=it.value/total;const a1=a0+frac*2*Math.PI;const big=frac>0.5?1:0;const x0=cx+R*Math.cos(a0),y0=cy+R*Math.sin(a0),x1=cx+R*Math.cos(a1),y1=cy+R*Math.sin(a1);const xi1=cx+r*Math.cos(a1),yi1=cy+r*Math.sin(a1),xi0=cx+r*Math.cos(a0),yi0=cy+r*Math.sin(a0);const d=`M${x0},${y0} A${R},${R},0,${big},1,${x1},${y1} L${xi1},${yi1} A${r},${r},0,${big},0,${xi0},${yi0} Z`;a0=a1;return{d,color:it.color};});
  return(<svg width={128} height={128} style={{flexShrink:0}}>{arcs.map((a,i)=><path key={i} d={a.d} fill={a.color}/>)}<text x={cx} y={cy-3} textAnchor="middle" style={{fontFamily:C.mono,fontSize:13,fontWeight:800,fill:C.ink}}>{(total/1000).toFixed(1)}k</text><text x={cx} y={cy+12} textAnchor="middle" style={{fontFamily:C.sans,fontSize:8,fill:C.dim}}>Total</text></svg>);
}
function BigChart({series,count,height=220,forceUp}){
  const sl=series.slice(-count);const min=Math.min(...sl),max=Math.max(...sl),range=max-min||max*0.01||1;
  const W=800,H=height,px=4,py=14;
  const xy=(i,v)=>[px+(i/(sl.length-1))*(W-px*2),H-py-((v-min)/range)*(H-py*2)];
  const line=sl.map((v,i)=>xy(i,v).join(",")).join(" ");
  const up=forceUp||sl[sl.length-1]>=sl[0];const col=up?C.green:C.red;
  const [xN,yN]=xy(sl.length-1,sl[sl.length-1]);const gid="g"+(up?"u":"d")+height;
  return(<svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height,display:"block"}} preserveAspectRatio="none">
    <defs><linearGradient id={gid} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={col} stopOpacity="0.15"/><stop offset="100%" stopColor={col} stopOpacity="0"/></linearGradient></defs>
    <polyline points={`${line} ${W-px},${H} ${px},${H}`} fill={`url(#${gid})`} stroke="none"/>
    <polyline points={line} fill="none" stroke={col} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"/>
    <circle cx={xN} cy={yN} r="4" fill={col}/>
    <circle cx={xN} cy={yN} fill={col}><animate attributeName="r" values="6;16;6" dur="2.6s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.25;0;0.25" dur="2.6s" repeatCount="indefinite"/></circle>
  </svg>);
}
