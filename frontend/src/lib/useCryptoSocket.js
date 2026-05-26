import { useEffect, useRef, useState } from 'react';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:4000';

export function useCryptoSocket() {
  const wsRef = useRef(null);
  const [status, setStatus] = useState('DISCONNECTED');
  const [ticker, setTicker] = useState(null);
  const [orderbook, setOrderbook] = useState({ bids: [], asks: [] });
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    let reconnectTimer;

    function connect() {
      setStatus('CONNECTING');
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => setStatus('CONNECTED');
      ws.onclose = () => {
        setStatus('DISCONNECTED');
        reconnectTimer = setTimeout(connect, 3000);
      };
      ws.onerror = () => setStatus('ERROR');
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'ticker') setTicker(data);
        if (data.type === 'orderbook') setOrderbook(data);
        if (data.type === 'alert') setAlerts((prev) => [data, ...prev].slice(0, 5));
        if (data.type === 'exchange_status') setStatus(data.status);
      };
    }

    connect();

    return () => {
      clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, []);

  return { status, ticker, orderbook, alerts };
}
