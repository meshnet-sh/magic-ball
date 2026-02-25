import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { get, set, del } from 'idb-keyval'

// Custom IDB storage for Zustand to bypass 5MB localStorage limit
const idbStorage = {
    getItem: async (name: string): Promise<string | null> => {
        return (await get(name)) || null
    },
    setItem: async (name: string, value: string): Promise<void> => {
        await set(name, value)
    },
    removeItem: async (name: string): Promise<void> => {
        await del(name)
    },
}

export type IdeaType = 'text' | 'audio' | 'image'

export interface Idea {
    id: string
    type: IdeaType
    content: string // text string, or base64 data URL for media
    tags: string[]
    createdAt: number
}

interface IdeasState {
    ideas: Idea[]
    isSyncing: boolean
    addIdea: (type: IdeaType, content: string, tags?: string[]) => Promise<void>
    removeIdea: (id: string) => Promise<void>
    clearAll: () => Promise<void>
    sync: () => Promise<void>
}

const generateId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
    return Date.now().toString(36) + Math.random().toString(36).substring(2)
}

export const useIdeasStore = create<IdeasState>()(
    persist(
        (set, get) => ({
            ideas: [],
            isSyncing: false,

            sync: async () => {
                set({ isSyncing: true })
                try {
                    const res = await fetch('/api/ideas')
                    if (res.ok) {
                        const data: any = await res.json()
                        if (data.success && data.data) {
                            set({ ideas: data.data })
                        }
                    }
                } catch (err) {
                    console.error("Failed to sync ideas", err)
                } finally {
                    set({ isSyncing: false })
                }
            },

            addIdea: async (type, content, tags = []) => {
                const newIdea: Idea = {
                    id: generateId(),
                    type,
                    content,
                    tags: Array.from(new Set(tags)),
                    createdAt: Date.now(),
                }

                // Optimistic UI update
                set((state) => ({ ideas: [newIdea, ...state.ideas] }))

                // Sync to Cloud
                try {
                    await fetch('/api/ideas', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(newIdea)
                    })
                } catch (err) {
                    console.error("Failed to save idea to cloud", err)
                }
            },

            removeIdea: async (id) => {
                set((state) => ({ ideas: state.ideas.filter((idea) => idea.id !== id) }))
                try {
                    await fetch(`/api/ideas?id=${id}`, { method: 'DELETE' })
                } catch (err) {
                    console.error("Failed to delete idea from cloud", err)
                }
            },

            clearAll: async () => {
                // Not supported via single API call yet, just reset local
                set({ ideas: [] })
            },
        }),
        {
            name: 'magic-ball-ideas-storage',
            storage: createJSONStorage(() => idbStorage),
        }
    )
)
