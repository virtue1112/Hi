import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage } from '../types';
import { chatWithGemini } from '../services/aiService';

const ChatBot: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const toggleChat = () => setIsOpen(!isOpen);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg: ChatMessage = { role: 'user', text: input, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
        // Format history for Gemini API
        const history = messages.map(m => ({
            role: m.role,
            parts: [{ text: m.text }]
        }));

        const responseText = await chatWithGemini(history, userMsg.text);
        
        const botMsg: ChatMessage = { role: 'model', text: responseText, timestamp: new Date() };
        setMessages(prev => [...prev, botMsg]);
    } catch (e) {
        console.error(e);
        const errorMsg: ChatMessage = { role: 'model', text: "I'm having trouble connecting to the memory stream right now.", timestamp: new Date() };
        setMessages(prev => [...prev, errorMsg]);
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end pointer-events-auto">
      {isOpen && (
        <div className="mb-4 w-80 md:w-96 bg-black/80 backdrop-blur-md border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[500px] transition-all duration-300">
            <div className="p-4 border-b border-white/10 flex justify-between items-center bg-white/5">
                <h3 className="text-sm font-semibold tracking-widest uppercase text-white/80">Memory Guide</h3>
                <button onClick={toggleChat} className="text-white/50 hover:text-white"><span className="material-symbols-outlined">close</span></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 && (
                    <div className="text-center text-white/30 text-sm mt-10 italic">
                        "Ask me about your memories, or the nature of forgetting..."
                    </div>
                )}
                {messages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm leading-relaxed ${msg.role === 'user' ? 'bg-white/20 text-white' : 'bg-indigo-500/20 text-indigo-100 border border-indigo-500/30'}`}>
                            {msg.text}
                        </div>
                    </div>
                ))}
                 {isLoading && (
                    <div className="flex justify-start">
                        <div className="bg-indigo-500/10 rounded-2xl px-4 py-2 flex gap-1">
                             <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce"></div>
                             <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce delay-75"></div>
                             <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce delay-150"></div>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className="p-4 border-t border-white/10 bg-white/5">
                <div className="flex gap-2">
                    <input 
                        type="text" 
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                        placeholder="Type a message..."
                        className="flex-1 bg-black/30 border border-white/10 rounded-full px-4 py-2 text-sm focus:outline-none focus:border-indigo-500/50 transition-colors text-white"
                    />
                    <button onClick={handleSend} disabled={isLoading} className="bg-white/10 hover:bg-white/20 text-white rounded-full p-2 transition-colors disabled:opacity-50">
                        <span className="material-symbols-outlined text-lg">send</span>
                    </button>
                </div>
            </div>
        </div>
      )}
      
      <button 
        onClick={toggleChat}
        className="w-14 h-14 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-purple-900/50 flex items-center justify-center hover:scale-110 transition-transform duration-200"
      >
        <span className="material-symbols-outlined text-white text-2xl">voice_chat</span>
      </button>
    </div>
  );
};

export default ChatBot;
