# Nexora - Data Universe Explorer 🚀

A space-themed, AI-powered dataset discovery platform that transforms the way you explore and find datasets. Instead of scrolling through lists, you'll navigate through a cosmic galaxy of data planets.

## ✨ Features

### 🔭 The Observatory (Landing Page)
- **Dark star-field background** with animated stars
- **Glowing search bar** with the message: "Type a query... watch datasets appear in your universe"
- **Nexora branding** with animated gradient text effects

### 🌌 The Data Galaxy (Search Results)
- **Planets represent datasets** - each dataset is a glowing orb in space
- **Position based on relevance** - closer planets = more relevant results
- **Size indicates dataset size** - larger datasets appear as bigger planets
- **Color coding by type**:
  - 🔵 Blue: Tabular data (CSV, Excel, JSON)
  - 🟣 Purple: Image datasets
  - 🟢 Green: Text datasets
  - 🔴 Red: Other/unknown types
- **Interactive exploration** - click planets to zoom in

### 🚀 Spaceship HUD (Dataset Details)
- **Zoomed-in planet view** with detailed information
- **Side panel interface** resembling a spaceship control panel
- **Dataset metadata**: title, type, description, source
- **Action buttons**: View on Kaggle, Download, Add to My Galaxy

## 🚀 Quick Start

### Prerequisites
- Python 3.8+
- Node.js 16+
- npm or yarn

### Backend Setup
1. **Install Python dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

2. **Start the backend server**:
   ```bash
   python main.py
   ```
   The API will be available at `http://localhost:8000`

### Frontend Setup
1. **Navigate to frontend directory**:
   ```bash
   cd frontend
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start the development server**:
   ```bash
   npm run dev
   ```
   The UI will be available at `http://localhost:5173`

## 🔧 How It Works

### Search Flow
1. **User types a query** in the Observatory search bar
2. **Backend processes the query** (currently using mock data, but designed to integrate with Tavily API)
3. **Results are visualized as planets** in 3D space using Three.js
4. **User explores the galaxy** by clicking on planets
5. **Detailed view opens** in the spaceship HUD panel

### Technical Architecture
- **Frontend**: React + TypeScript + Three.js for 3D graphics
- **Backend**: FastAPI with CORS support for frontend communication
- **3D Engine**: Three.js with post-processing effects (bloom, glow)
- **State Management**: React hooks for UI state management
- **Responsive Design**: Mobile-friendly interface with adaptive layouts

## 🎨 UI Components

### Landing Page
- Centered search interface with animated title
- Glowing search input with placeholder text
- Gradient search button with hover effects

### Results View
- Header with back navigation and result count
- Color-coded legend for dataset types
- 3D space with orbiting planets
- Smooth camera animations

### Detail Panel
- Right-side HUD panel with dataset information
- Action buttons for dataset operations
- Smooth slide-in animation
- Responsive design for mobile devices

## 🔮 Future Enhancements

- **Real Tavily API Integration**: Replace mock data with actual search results
- **Advanced 3D Interactions**: Orbit controls, zoom gestures, planet rotation
- **Dataset Previews**: Show sample data when hovering over planets
- **User Collections**: Save favorite datasets to personal galaxy
- **Advanced Filtering**: Filter by dataset size, type, or source
- **Export Functionality**: Download datasets directly from the UI

## 🛠️ Development

### Project Structure
```
Nexora/
├── frontend/                 # React frontend
│   ├── src/
│   │   └── scene/
│   │       └── App.tsx      # Main UI component
│   ├── index.html           # HTML with CSS styles
│   └── package.json         # Frontend dependencies
├── main.py                  # FastAPI backend
├── requirements.txt          # Python dependencies
└── README.md               # This file
```

### Key Technologies
- **Three.js**: 3D graphics and animations
- **React**: UI framework and state management
- **TypeScript**: Type-safe development
- **FastAPI**: High-performance Python web framework
- **Vite**: Fast frontend build tool

## 🌟 Why This Approach?

Traditional dataset discovery involves scrolling through lists and cards. Nexora transforms this into an **immersive space exploration experience**:

- **Visual Discovery**: See relationships between datasets through spatial positioning
- **Engaging Interface**: 3D interaction makes data exploration fun and memorable
- **Scalable Design**: Can handle hundreds of datasets in an organized space
- **Modern UX**: Leverages 3D graphics and smooth animations for premium feel

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

---

**Ready to explore the data universe?** 🚀 Start your journey with Nexora!