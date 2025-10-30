import { useQuery } from "@tanstack/react-query";
import { Routes, Route, Link } from "react-router-dom";
import { AudioPlayer } from "./components/audio-player";
import type { Track } from "./types/audio-player";

const track: Track = {
  id: "1",
  title: "My Song",
  artist: "Artist Name",
  source: "html5",
  url: "https://yhoyscexuxnouexhcndo.supabase.co/storage/v1/object/public/jukebox-tracks/zx6NkXvzrNc.webm",
  artwork: "https://picsum.photos/1500",
};

// A tiny data-fetching function used by useQuery
async function fetchMessage(): Promise<{ message: string }> {
  // example: in a real app replace with fetch('/api/whatever')
  return new Promise((resolve) => {
    setTimeout(() => resolve({ message: "Hello from react-query!" }), 300);
  });
}

function Home() {
  // useQuery returns { data, error, isLoading, ... }
  const { data, isLoading, error } = useQuery({
    queryKey: ["homeMessage"],
    queryFn: fetchMessage,
  });

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error loading message</div>;

  return (
    <div className="p-4">
      <h2 className="text-2xl font-semibold">Home</h2>
      <p className="mt-2">{data?.message}</p>

      <AudioPlayer
        track={track}
        mode="host"
        variant="full"
        onNext={() => console.log("Next track")}
        onPrevious={() => console.log("Previous track")}
      />
    </div>
  );
}

function About() {
  return (
    <div className="p-4">
      <h2 className="text-2xl font-semibold">About</h2>
      <p className="mt-2">
        This is a small demo of React Router + React Query.
      </p>
    </div>
  );
}

function App() {
  return (
    <>
      <header className="p-4 bg-gray-100">
        <nav className="flex gap-4">
          <Link to="/" className="text-blue-600">
            Home
          </Link>
          <Link to="/about" className="text-blue-600">
            About
          </Link>
        </nav>
      </header>

      <main className="p-4">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
        </Routes>
      </main>
    </>
  );
}

export default App;
