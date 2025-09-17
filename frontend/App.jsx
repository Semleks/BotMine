import { useState } from "react"

export default function App() {
    const [ws, setWs] = useState(null)
    const [host, setHost] = useState("localhost")
    const [username, setUsername] = useState("Bot123")
    const [logs, setLogs] = useState([])

    function connect() {
        const socket = new WebSocket("ws://localhost:3001")
        socket.onmessage = (event) => {
            const data = JSON.parse(event.data)
            setLogs((prev) => [...prev, `${data.type}: ${data.message || data.username + ": " + data.message}`])
        }
        setWs(socket)
    }

    function createBot() {
        if (!ws) return
        ws.send(JSON.stringify({ type: "createBot", host, username }))
    }

    return (
        <div className="p-4">
            {!ws && <button onClick={connect}>Подключить WebSocket</button>}

            <div className="mt-4">
                <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="IP сервера" className="border p-2" />
                <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Ник" className="border p-2 ml-2" />
                <button onClick={createBot} className="bg-blue-500 text-white p-2 ml-2">Создать бота</button>
            </div>

            <div className="mt-4">
                <h2>Логи:</h2>
                <pre className="bg-gray-100 p-2">{logs.join("\n")}</pre>
            </div>
        </div>
    )
}
