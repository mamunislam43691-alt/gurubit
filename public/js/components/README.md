# AuthPage Component

## Overview
The AuthPage component provides a combined sign up and login interface with mobile-first responsive design.

## Features

### Mobile-First Design (Requirement 14.1, 14.5)
- Responsive layout that adapts to mobile, tablet, and desktop viewports
- Touch-friendly interactive elements with minimum 44x44 pixel tap targets
- Optimized for mobile devices with proper viewport configuration
- Smooth transitions and hover effects

### Form Validation (Requirement 1.1)
- **Email Validation**: Validates proper email format
- **Password Validation**: 
  - Login: Basic required field validation
  - Signup: Minimum 8 characters with at least one letter and one number
- **Name Validation**: Minimum 2 characters (signup only)
- **Confirm Password**: Ensures passwords match (signup only)
- Real-time error clearing when user starts typing

### Tailwind CSS Styling (Requirement 14.1)
- Utility-first CSS framework for consistent styling
- Responsive breakpoints (sm, md, lg)
- Custom focus states for accessibility
- Shadow and border styling for depth

### SVG Icons (Requirement 14.4)
- High-quality scalable vector graphics
- Logo icon (mobile phone)
- Guest access icon (user profile)
- Consistent stroke width and styling

### Dual Mode Interface (Requirement 1.1)
- Toggle between login and signup modes
- Smooth transition between modes
- Form state reset on mode change
- Clear visual indication of current mode

### Accessibility Features
- Proper label associations
- Focus indicators (2px blue outline)
- Semantic HTML structure
- Keyboard navigation support
- Autocomplete attributes for better UX

## Component Structure

```
AuthPage
├── Form Container
│   ├── Logo & Header
│   ├── Auth Form
│   │   ├── Name Field (signup only)
│   │   ├── Email Field
│   │   ├── Password Field
│   │   └── Confirm Password Field (signup only)
│   ├── Submit Button
│   └── Mode Toggle Button
└── Guest Access Link
```

## API Integration

### Signup Endpoint
```
POST /api/auth/signup
Body: { name, email, password }
Response: { success, message, user }
```

### Login Endpoint
```
POST /api/auth/login
Body: { email, password }
Response: { success, message, user, token }
```

## Usage

```javascript
import { AuthPage } from './components/AuthPage.js';

const authPage = new AuthPage();
authPage.init();
```

## Touch Target Compliance

All interactive elements meet the minimum 44x44 pixel touch target requirement:
- Input fields: 44px height (py-3 = 12px padding × 2 + text height)
- Buttons: 44px minimum height
- Toggle links: Inline-flex with adequate padding

## Browser Support

- Modern browsers with ES6+ support
- Mobile Safari (iOS)
- Chrome Mobile (Android)
- Desktop browsers (Chrome, Firefox, Safari, Edge)

## Future Enhancements

- Password visibility toggle
- Social authentication options
- Remember me functionality
- Forgot password flow
- Email verification
