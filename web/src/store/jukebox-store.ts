import { create } from 'zustand';
import type { Track } from '../types/audio-player';
import type { PlayerControls } from '../components/audio-player';
import type { QueueItem } from '../components/queue-search';

interface JukeboxStore {
    // WebSocket connection
    ws: WebSocket | null;
    setWs: (ws: WebSocket | null) => void;
    
    // Player controls (for programmatic control)
    controls: PlayerControls | null;
    setControls: (controls: PlayerControls | null) => void;
    
    // User mode (host/listener)
    mode: "host" | "listener";
    setMode: (mode: "host" | "listener") => void;
    
    // Current track
    currentTrack: Track | null;
    setCurrentTrack: (track: Track | null) => void;
    
    // Queue
    queue: QueueItem[];
    setQueue: (queue: QueueItem[]) => void;
    
    // Track mode (html5/youtube) - for internal use
    trackMode: "html5" | "youtube";
    setTrackMode: (mode: "html5" | "youtube") => void;
    
    // Current user info
    currentUser: {
        name: string;
        role: string;
        client_ip: string;
        client_port?: string | number;
    } | null;
    setCurrentUser: (user: {
        name: string;
        role: string;
        client_ip: string;
        client_port?: string | number;
    } | null) => void;
    
    // Room users list
    roomUsers: Array<{
        name: string;
        role: string;
        client_ip: string;
        client_port?: string | number;
        is_host: boolean;
        is_moderator: boolean;
    }>;
    setRoomUsers: (users: Array<{
        name: string;
        role: string;
        client_ip: string;
        client_port?: string | number;
        is_host: boolean;
        is_moderator: boolean;
    }>) => void;
    addRoomUsers: (users: Array<{
        name: string;
        role: string;
        client_ip: string;
        client_port?: string | number;
        is_host: boolean;
        is_moderator: boolean;
    }>) => void;
    usersTotal: number;
    setUsersTotal: (total: number) => void;
    lastReceivedUsersPage: number | null;
    setLastReceivedUsersPage: (page: number | null) => void;
    
    // Room settings
    roomSettings: {
        chat_enabled: boolean;
        voting_enabled: boolean;
        voting_duration: number;
        voting_duration_enabled: boolean;
    } | null;
    setRoomSettings: (settings: {
        chat_enabled: boolean;
        voting_enabled: boolean;
        voting_duration: number;
        voting_duration_enabled: boolean;
    } | null) => void;
}

export const useJukeboxStore = create<JukeboxStore>((set) => ({
    ws: null,
    setWs: (ws) => set({ ws }),
    
    controls: null,
    setControls: (controls) => set({ controls }),
    
    mode: "host",
    setMode: (mode) => set({ mode }),
    
    currentTrack: null,
    setCurrentTrack: (track) => set({ currentTrack: track }),
    
    queue: [],
    setQueue: (queue) => set({ queue }),
    
    trackMode: "html5",
    setTrackMode: (mode) => set({ trackMode: mode }),
    
    currentUser: null,
    setCurrentUser: (user) => set({ currentUser: user }),
    
    roomUsers: [],
    setRoomUsers: (users) => set({ roomUsers: users }),
    addRoomUsers: (users) => set((state) => {
        // Merge new users, avoiding duplicates based on client_ip and client_port
        const existingKeys = new Set(
            state.roomUsers.map(u => `${u.client_ip}:${u.client_port}`)
        );
        const newUsers = users.filter(
            u => !existingKeys.has(`${u.client_ip}:${u.client_port}`)
        );
        return { roomUsers: [...state.roomUsers, ...newUsers] };
    }),
    usersTotal: 0,
    setUsersTotal: (total) => set({ usersTotal: total }),
    lastReceivedUsersPage: null,
    setLastReceivedUsersPage: (page) => set({ lastReceivedUsersPage: page }),
    
    roomSettings: null,
    setRoomSettings: (settings) => set({ roomSettings: settings }),
}));

