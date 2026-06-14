import { C } from "../theme.js";
import Panel from "../components/Panel.jsx";
import MarketWatch from "../components/MarketWatch.jsx";
import AccountCard from "../components/AccountCard.jsx";
import StockDetail from "../components/StockDetail.jsx";

// MARKET TAB — ONE connected white container. Left section (account summary +
// market watch, nothing between them) | grey divider line | right section
// (shared StockDetail). No floating grey gaps.
export default function Market({
  active, setActive, tf, setTf, stock, positions,
  tradeMode, setTradeMode, tradeAmt, setTradeAmt, trade, cash, totalValue, history, invested, lists,
}) {
  return (
    <Panel pad={0}>
      {/* Fixed-height grid so each column scrolls independently (Trading 212 style):
          scrolling the watchlist on the left doesn't move the stock detail on the right. */}
      <div style={{ display: "grid", gridTemplateColumns: "470px 1fr", height: "calc(100vh - 124px)" }}>
        {/* LEFT — account + watchlist, divided from the right by one line; own scroll */}
        <div className="colscroll" style={{ borderRight: `1px solid ${C.line}`, overflowY: "auto", minHeight: 0 }}>
          <AccountCard totalValue={totalValue} cash={cash} positions={positions} history={history} invested={invested} />
          <MarketWatch active={active} setActive={setActive} lists={lists} />
        </div>

        {/* RIGHT — stock detail; own scroll */}
        <div className="colscroll" style={{ overflowY: "auto", minHeight: 0 }}>
          <StockDetail
            active={active} stock={stock} tf={tf} setTf={setTf} positions={positions}
            tradeMode={tradeMode} setTradeMode={setTradeMode} tradeAmt={tradeAmt}
            setTradeAmt={setTradeAmt} trade={trade} cash={cash}
          />
        </div>
      </div>
    </Panel>
  );
}
