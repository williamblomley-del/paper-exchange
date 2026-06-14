import { C } from "../theme.js";

// The global <style> block from PaperExchange.jsx: font import, resets, and all
// hover/transition classes (.lift, .nav-tab, .wrow, .btn, .trbtn, .tfbtn, .pi).
export default function GlobalStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
      *,*::before,*::after{box-sizing:border-box}
      html{font-variant-numeric:tabular-nums}
      button{cursor:pointer;font-family:inherit}
      .colscroll{scrollbar-width:none;-ms-overflow-style:none}
      .colscroll::-webkit-scrollbar{width:0;height:0;display:none}
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
  );
}
