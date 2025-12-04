import { Routes, Route } from "react-router-dom";
import About from "./About";
import Jukebox from "./Jukebox";

function App() {
    return (
        <Routes>
            <Route path="/" element={<Jukebox />} />
            <Route path="/about" element={<About />} />
        </Routes>
    );
}

export default App;
