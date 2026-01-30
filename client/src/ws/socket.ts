





let socket: WebSocket | null = null;
let sessionId: string | null = null;
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;
const reconnectDelay = 1000; 

function connect() {
    socket = new WebSocket('ws://your-websocket-url');

    socket.onopen = () => {
        console.log('WebSocket connected');
        reconnectAttempts = 0; 
    };

    socket.onclose = () => {
        console.log('WebSocket closed, attempting to reconnect...');
        reconnect();
    };

    socket.onmessage = (event) => {
        
    };
}

function reconnect() {
    if (reconnectAttempts < maxReconnectAttempts) {
        reconnectAttempts++;
        const delay = reconnectDelay * Math.pow(2, reconnectAttempts - 1); 
        setTimeout(() => {
            console.log(`Reconnecting in ${delay / 1000} seconds...`);
            connect();
        }, delay);
    } else {
        console.error('Max reconnect attempts reached.');
    }
}


connect();
