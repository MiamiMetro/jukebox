from fastapi import FastAPI, WebSocket, WebSocketDisconnect
import json, time

app = FastAPI()

clients = set()

@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await ws.accept()
    clients.add(ws)
    print("Client connected")

    try:
        while True:
            # Receive JSON from client
            data = await ws.receive_text()
            packet = json.loads(data)
            packet["server_time"] = time.time()

            # Broadcast to everyone (except sender)
            for peer in list(clients):
                if peer != ws:
                    await peer.send_text(json.dumps(packet))
    except WebSocketDisconnect:
        clients.remove(ws)
        print("Client disconnected")

@app.get("/")
async def read_root():
    return {"message": "WebSocket server is running"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)