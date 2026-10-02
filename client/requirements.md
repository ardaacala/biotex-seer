## Packages
zustand | Global state management for authentication and preferences
recharts | Beautiful charts and analytics for the dashboard
date-fns | Date formatting and manipulation
framer-motion | Page transitions and smooth micro-interactions
react-webcam | (Optional) if needed, but standard HTML input with capture="environment" is sufficient. We will use standard HTML5 camera capture.

## Notes
- Images are converted to Base64 on the client via FileReader and sent as `photoUrl` in the POST/PUT requests.
- The app uses a bottom navigation bar on mobile screens and a sidebar on desktop.
- Zustand is used to persist and synchronize the current logged-in user state across the app.
