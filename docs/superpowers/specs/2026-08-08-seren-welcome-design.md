# Seren Welcome Page Design

## Goal

Turn the authenticated pre-slideshow screen into a soft keepsake introduction to Seren's story, while preserving the existing private login and slideshow behaviour.

## Experience

The family password screen remains unchanged. After successful authentication, the visitor sees a responsive cream-and-blush welcome page with subtle star details and the following copy:

- Eyebrow: **Seren’s little story**
- Heading: **From your very first days…**
- Body: **A collection of tiny moments, growing smiles, and all the love that has surrounded you since the day you arrived.**
- Primary action: **Begin the journey**

The page should feel like the opening page of a baby book: warm, quiet, personal, and easy to read. It must retain the existing accessible button semantics and work comfortably on phone-sized screens.

## Behaviour and Privacy

The introduction appears only after family authentication, so the public login page reveals no additional family details. Selecting **Begin the journey** uses the existing playlist request, analytics event, soundtrack attempt, and shuffled ordering. Loading and error semantics are unchanged by this presentation-only change.

## Implementation Boundaries

Use a dedicated class for the authenticated welcome state so the light keepsake treatment does not change the login, slideshow, consent prompt, or admin interface. Keep the existing slideshow data flow intact.

## Verification

Add a focused client test for the approved copy and journey action, then run the complete typecheck, unit/integration suite, production build, and existing browser gate. Check narrow-screen styling and reduced-motion compatibility.
