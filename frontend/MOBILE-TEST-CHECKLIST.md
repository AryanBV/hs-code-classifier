# Mobile Testing Checklist

Comprehensive testing checklist for mobile-first HS Code Classifier application.

---

## Test Devices

### Tested Configurations:
- ✅ iPhone SE (375×667) - Small phone
- ✅ iPhone 12 Pro (390×844) - Standard phone
- ✅ iPhone 14 Pro Max (430×932) - Large phone
- ✅ iPad Mini (768×1024) - Small tablet
- ✅ iPad Pro (1024×1366) - Large tablet
- ✅ Desktop (1920×1080) - Standard desktop

---

## ✅ Visual Layout

### No Horizontal Scrolling
- [ ] iPhone SE (375px) - Check all pages
- [ ] iPhone 12 Pro (390px) - Check all pages
- [ ] iPhone 14 Pro Max (430px) - Check all pages
- [ ] iPad Mini (768px) - Check all pages
- [ ] iPad Pro (1024px) - Check all pages
- [ ] Desktop (1920px) - Check all pages

**Test Steps:**
1. Open http://localhost:3003
2. Resize browser to each device size
3. Scroll through entire page
4. Check for horizontal scrollbar
5. Verify no content overflow

### Text Readability
- [ ] Hero heading readable on 375px (text-3xl = 30px)
- [ ] Subheading readable on 375px (text-lg = 18px)
- [ ] Form labels readable (text-sm = 14px)
- [ ] Button text readable (text-sm = 14px)
- [ ] Error messages readable (text-sm = 14px)
- [ ] Results text readable (text-base = 16px)

**Test Steps:**
1. Load page on smallest device (iPhone SE 375px)
2. Check all text sizes without zooming
3. Verify comfortable reading distance

### Button Sizing (WCAG 2.1 - Min 44×44px)
- [ ] Submit button: `min-h-[44px]` ✓
- [ ] Clear button: `min-h-[44px]` ✓
- [ ] Feedback buttons (Correct/Incorrect/Unsure): `min-h-[44px]` ✓
- [ ] New Classification button: `min-h-[44px]` ✓
- [ ] Try Again button: `min-h-[44px]` ✓
- [ ] Collapsible toggle buttons: Touch-friendly ✓

**Test Steps:**
1. Inspect all buttons with DevTools
2. Verify height ≥ 44px
3. Test tapping on mobile simulator
4. Ensure no accidental adjacent taps

### Spacing Comfort
- [ ] Container padding appropriate (`px-4` = 16px)
- [ ] Card padding appropriate (`p-4` = 16px mobile, `p-6` = 24px tablet)
- [ ] Gap between elements (`gap-3` = 12px, `gap-6` = 24px)
- [ ] Section spacing (`mb-6` = 24px, `mb-8` = 32px)

**Test Steps:**
1. Visual inspection on mobile
2. Check spacing doesn't feel cramped
3. Verify touch targets have breathing room

### Images/Icons
- [ ] AlertCircle icon (h-5 w-5 = 20px) - Visible
- [ ] CheckCircle2 icon (h-4 w-4 = 16px) - Visible
- [ ] XCircle icon (h-4 w-4 = 16px) - Visible
- [ ] HelpCircle icon (h-4 w-4 = 16px) - Visible
- [ ] ChevronUp/Down icons (h-4 w-4 = 16px) - Visible
- [ ] Loader2 spinner (h-4 w-4 = 16px) - Visible and animates

**Test Steps:**
1. Check all icons render correctly
2. Verify animations are smooth
3. Ensure icons don't overflow containers

---

## ✅ Forms

### Input Field Font Size (Prevents iOS Zoom)
- [ ] Textarea: `text-base` (16px) ✓
- [ ] Select dropdown: `text-base` (16px) ✓
- [ ] All inputs ≥ 16px font size

**Test Steps:**
1. Tap textarea on iOS Safari simulator
2. Verify no automatic zoom occurs
3. Type and check font size stays 16px

### Textarea Behavior
- [ ] 6 rows visible on mobile
- [ ] Placeholder text visible
- [ ] Can type long descriptions (up to 1000 chars)
- [ ] Character counter updates in real-time
- [ ] Validation message appears when < 20 chars
- [ ] Disabled state works (grayed out during loading)

**Test Steps:**
1. Type 10 characters → See orange validation
2. Type 20 characters → Validation disappears, counter green
3. Type 900 characters → Counter turns orange (90% threshold)
4. Submit form → Textarea disabled with spinner

### Select Dropdown
- [ ] Opens native picker on mobile
- [ ] Shows all country options (IN, USA, EU, UK, UAE)
- [ ] Selected value displays correctly
- [ ] Disabled state works during loading

**Test Steps:**
1. Tap select dropdown on mobile
2. Verify native picker appears
3. Select different countries
4. Verify selection updates

### Submit Button Accessibility
- [ ] Visible without scrolling on iPhone SE
- [ ] Disabled when description < 20 chars
- [ ] Disabled during loading
- [ ] Shows spinner + "Classifying..." during loading
- [ ] Changes to "Classify Product" when ready

**Test Steps:**
1. Load form on iPhone SE (375px)
2. Verify submit button visible without scroll
3. Type < 20 chars → Button disabled
4. Type ≥ 20 chars → Button enabled
5. Submit → See spinner and "Classifying..."

### Error Messages
- [ ] Character counter visible (bottom right)
- [ ] Validation message visible (orange text below textarea)
- [ ] Error banner visible at top (dismissible)
- [ ] Error state in ResultsDisplay (XCircle icon)

**Test Steps:**
1. Type 10 chars → See "Please provide at least 20 characters"
2. Simulate network error → See error banner
3. Dismiss error → Banner disappears
4. See error in ResultsDisplay with "Try Again" button

---

## ✅ Navigation

### Hero Section
- [ ] Heading scales properly (text-3xl → text-5xl)
- [ ] Subheading scales properly (text-lg → text-xl)
- [ ] Features text readable (text-sm)
- [ ] Centered on all devices
- [ ] No overflow

**Test Steps:**
1. Resize from 375px to 1920px
2. Verify text scales smoothly
3. Check centering on all sizes

### Error Banner
- [ ] Shows at top when error occurs
- [ ] AlertCircle icon visible
- [ ] Error message readable
- [ ] Close button (✕) works on touch
- [ ] Dismisses when clicked

**Test Steps:**
1. Simulate error (disconnect internet)
2. Submit form
3. Verify banner appears
4. Tap ✕ to dismiss
5. Verify banner disappears

### Form Visibility
- [ ] Form shows when no results
- [ ] Results show when classification complete
- [ ] Can toggle between form and results
- [ ] Reset button returns to form

**Test Steps:**
1. Load page → See form
2. Submit classification → See results
3. Click "New Classification" → See form again

---

## ✅ Results Display

### HS Code Display
- [ ] HS code clearly visible (text-2xl → text-3xl, font-mono)
- [ ] Description readable (text-sm → text-base)
- [ ] Confidence badge visible (color-coded)
- [ ] Layout works on mobile (vertical stack)
- [ ] Layout works on tablet+ (horizontal row)

**Test Steps:**
1. Submit "Ceramic brake pads for motorcycles"
2. Verify HS code 8708.30.00 visible
3. Check description: "Brakes and parts thereof"
4. See confidence: 61% (yellow badge)
5. Resize to see layout change at 640px

### Reasoning Section
- [ ] Collapsible toggle button works
- [ ] ChevronUp/Down icon indicates state
- [ ] Text readable when expanded (text-sm)
- [ ] Collapses smoothly on tap
- [ ] Open by default (showReasoning: true)

**Test Steps:**
1. See results with reasoning visible
2. Tap "Why this code?" → Reasoning collapses
3. Tap again → Reasoning expands
4. Verify smooth animation

### Country Mapping
- [ ] Shows when available
- [ ] Grid layout: 1 col mobile, 2 cols tablet
- [ ] India HS Code visible
- [ ] Destination code visible (if available)
- [ ] Import duty visible (if available)
- [ ] Font-mono for codes

**Test Steps:**
1. Check if country mapping section appears
2. Resize from mobile to tablet
3. Verify 1 col → 2 cols transition
4. Check all fields display correctly

### Feedback Buttons
- [ ] Stack vertically on mobile (grid-cols-1)
- [ ] 3 columns on tablet+ (sm:grid-cols-3)
- [ ] All buttons min-h-[44px]
- [ ] Icons visible (CheckCircle2, XCircle, HelpCircle)
- [ ] Touch-friendly spacing (gap-2 → gap-3)
- [ ] Hover states work (bg-green-50, bg-red-50, bg-accent)

**Test Steps:**
1. See 3 buttons stacked on iPhone SE
2. Resize to 640px → See 3 buttons in row
3. Tap each button → See console log
4. Verify hover effects on desktop

### Alternative Codes
- [ ] Collapsible section works
- [ ] Closed by default (showAlternatives: false)
- [ ] Shows count: "Alternative Codes (2)"
- [ ] Each alternative has HS code, description, confidence
- [ ] Alternatives stack on mobile
- [ ] Confidence badges color-coded

**Test Steps:**
1. See "Alternative Codes (2)" collapsed
2. Tap to expand → See alternatives
3. Verify each has code, description, reasoning
4. Check confidence badges (green/yellow/red)

### Actions Section
- [ ] "New Classification" button visible
- [ ] Full-width on mobile
- [ ] Auto-width on tablet+ (sm:w-auto)
- [ ] Centered (justify-center)
- [ ] Min-h-[44px]

**Test Steps:**
1. See button full-width on mobile
2. Resize to tablet → See auto-width
3. Tap button → Return to form
4. Verify smooth transition

### Classification ID
- [ ] Shows at bottom
- [ ] Centered (text-center)
- [ ] Small text (text-xs)
- [ ] Format: "ID: cls_1234567890_abc"

**Test Steps:**
1. Scroll to bottom of results
2. See classification ID
3. Verify format matches

---

## ✅ Performance

### Page Load Time
- [ ] Initial load < 3 seconds (dev mode)
- [ ] Initial load < 2 seconds (production build)
- [ ] No render-blocking resources
- [ ] Fast Refresh works (< 500ms)

**Test Steps:**
1. Clear cache
2. Reload page
3. Measure time to interactive
4. Check DevTools Network tab

### Animations
- [ ] Collapsible sections smooth (no jank)
- [ ] Loading spinner smooth (animate-spin)
- [ ] Hover effects smooth (transition-colors)
- [ ] No layout shifts (CLS)

**Test Steps:**
1. Toggle reasoning section → Smooth
2. Toggle alternatives section → Smooth
3. Submit form → Spinner smooth
4. Hover buttons → Smooth color change

### Scrolling
- [ ] Smooth scroll on all devices
- [ ] No janky scroll on mobile
- [ ] Scroll position preserved after interactions
- [ ] No unexpected jumps

**Test Steps:**
1. Scroll page on mobile simulator
2. Check for smooth 60fps scroll
3. Interact with collapsibles
4. Verify no scroll position jumps

### Layout Shifts (CLS)
- [ ] No shift when images load
- [ ] No shift when results load
- [ ] No shift when error banner appears
- [ ] No shift when collapsibles toggle

**Test Steps:**
1. Record page load in DevTools Performance
2. Check Cumulative Layout Shift (CLS)
3. Target: CLS < 0.1 (Good)

---

## ✅ Functionality

### Submit Classification
- [ ] Can submit from iPhone SE
- [ ] Can submit from iPad
- [ ] Can submit from desktop
- [ ] Loading state shows spinner
- [ ] Results load correctly (3-10 seconds)

**Test Steps:**
1. Enter "Ceramic brake pads for motorcycles"
2. Select "India (Export)"
3. Click "Classify Product"
4. Wait for results (expect 3-10s)
5. Verify HS code 8708.30.00 appears

### Results Display
- [ ] HS code visible
- [ ] Description visible
- [ ] Confidence badge visible
- [ ] Reasoning visible
- [ ] Feedback buttons work (console log)

**Test Steps:**
1. See results from above
2. Check all elements present
3. Tap "Correct" → See console log
4. Tap "Incorrect" → See console log
5. Tap "Unsure" → See console log

### Feedback System
- [ ] Correct button works
- [ ] Incorrect button works
- [ ] Unsure button works
- [ ] Console logs feedback type
- [ ] TODO: API submission (Phase 3)

**Test Steps:**
1. Tap each feedback button
2. Check console for logs
3. Verify feedback type logged

### New Classification
- [ ] "New Classification" button works
- [ ] Clears results
- [ ] Clears error state
- [ ] Shows form again
- [ ] Form is empty (unless user hasn't cleared)

**Test Steps:**
1. After seeing results
2. Click "New Classification"
3. Verify form appears
4. Verify results cleared
5. Verify no error banner

### Error States
- [ ] Network error shows error banner
- [ ] Timeout error shows error banner
- [ ] Server error shows error banner
- [ ] Error dismisses with ✕ button
- [ ] Error shows in ResultsDisplay

**Test Steps:**
1. Disconnect internet
2. Submit form
3. See "Network error - please check your internet connection"
4. Tap ✕ → Error banner disappears
5. See ResultsDisplay with error state

---

## ✅ Edge Cases

### Very Long Descriptions
- [ ] 500 character description works
- [ ] 1000 character description works (max)
- [ ] Counter turns orange at 900 chars (90%)
- [ ] Cannot type beyond 1000 chars
- [ ] Results display correctly

**Test Steps:**
1. Type 500 chars → Verify accepted
2. Type 1000 chars → Counter shows 1000/1000
3. Try typing more → Blocked
4. Submit → Results display correctly

### Very Short Descriptions
- [ ] 5 word description shows validation error
- [ ] 10 character description shows validation error
- [ ] 20 character description is minimum
- [ ] Submit button disabled when < 20 chars

**Test Steps:**
1. Type "brake pads" (10 chars) → Button disabled
2. See validation: "Please provide at least 20 characters"
3. Type "ceramic brake pads for motorcycles" (37 chars) → Button enabled
4. Submit → Works correctly

### Network Timeout (30 seconds)
- [ ] Request times out after 30 seconds
- [ ] Shows timeout error message
- [ ] Error: "Request timeout - server took too long to respond"
- [ ] Can retry after timeout
- [ ] Loading spinner stops

**Test Steps:**
1. Modify backend to delay response 35 seconds
2. Submit form
3. Wait 30 seconds
4. See timeout error
5. Verify can submit again

### Backend Error Handling
- [ ] 400 Bad Request → Shows server error message
- [ ] 404 Not Found → Shows server error message
- [ ] 500 Internal Server Error → Shows server error message
- [ ] Invalid JSON → Shows "Invalid server response - expected JSON"

**Test Steps:**
1. Simulate each error type
2. Verify appropriate error message
3. Check error banner appears
4. Check ResultsDisplay shows error

### No Results Returned
- [ ] Shows "No Results Found" state
- [ ] HelpCircle icon visible
- [ ] Message: "Unable to classify with sufficient confidence"
- [ ] "New Classification" button works

**Test Steps:**
1. Submit product with very low confidence
2. See "No Results Found" state
3. Verify message and icon
4. Click "New Classification"

---

## Device-Specific Tests

### iOS Safari
- [ ] No double-tap zoom (16px font on inputs)
- [ ] Viewport meta tag correct (max-scale=5)
- [ ] Touch events work (no 300ms delay)
- [ ] Smooth scrolling on iOS
- [ ] Safe area insets respected

**Test Steps:**
1. Open in iOS Safari simulator
2. Tap input → No zoom
3. Double-tap → No zoom (or controlled)
4. Test all touch interactions
5. Check safe area on iPhone X+

### Android Chrome
- [ ] Bottom nav doesn't cover content
- [ ] Viewport height correct (100vh)
- [ ] Touch events work
- [ ] Material Design ripple effects
- [ ] Back button works

**Test Steps:**
1. Open in Android Chrome simulator
2. Scroll to bottom → No content hidden
3. Test all touch interactions
4. Press back button → Navigates correctly

### iPad
- [ ] Uses tablet layout (640px+)
- [ ] 3-column features grid
- [ ] 2-column country mapping
- [ ] 3-column feedback buttons
- [ ] Horizontal layout for HS code + confidence

**Test Steps:**
1. Open on iPad Mini (768px)
2. Verify 3-column features grid
3. Check results use tablet layout
4. Test all tablet-specific layouts

### Landscape Mode
- [ ] Page usable in landscape
- [ ] No excessive white space
- [ ] Buttons accessible
- [ ] No content cut off
- [ ] Responsive layouts work

**Test Steps:**
1. Rotate device to landscape
2. Check all pages
3. Verify usability
4. Test all interactions

---

## Accessibility Tests

### Keyboard Navigation
- [ ] Can tab through all inputs
- [ ] Focus visible on all elements
- [ ] Enter submits form
- [ ] Escape closes modals/banners
- [ ] Tab order is logical

**Test Steps:**
1. Tab through entire page
2. Verify focus indicators
3. Press Enter on submit button
4. Check tab order makes sense

### Screen Reader
- [ ] All images have alt text
- [ ] Form labels associated with inputs
- [ ] ARIA labels on icon buttons
- [ ] Error messages announced
- [ ] Loading states announced

**Test Steps:**
1. Enable screen reader
2. Navigate entire page
3. Submit form
4. Verify all content announced

### Color Contrast
- [ ] Text meets WCAG AA (4.5:1)
- [ ] Buttons meet WCAG AA
- [ ] Links meet WCAG AA
- [ ] Error messages meet WCAG AA

**Test Steps:**
1. Use contrast checker tool
2. Check all text/background pairs
3. Verify ≥ 4.5:1 ratio

---

## Performance Metrics

### Lighthouse Scores (Mobile)
- [ ] Performance: > 90
- [ ] Accessibility: > 95
- [ ] Best Practices: > 90
- [ ] SEO: > 90

**Test Steps:**
1. Open DevTools → Lighthouse
2. Select "Mobile" device
3. Run audit
4. Review scores

### Core Web Vitals
- [ ] LCP (Largest Contentful Paint): < 2.5s (Good)
- [ ] FID (First Input Delay): < 100ms (Good)
- [ ] CLS (Cumulative Layout Shift): < 0.1 (Good)

**Test Steps:**
1. Open DevTools → Performance
2. Record page load
3. Check Web Vitals
4. Target all "Good" ratings

### Bundle Size
- [ ] JavaScript bundle < 200KB (gzipped)
- [ ] CSS bundle < 50KB (gzipped)
- [ ] Total page size < 500KB
- [ ] No unnecessary dependencies

**Test Steps:**
1. Run `npm run build`
2. Check `.next/static` folder
3. Verify bundle sizes
4. Analyze with webpack-bundle-analyzer (optional)

---

## Bug Tracking

### Critical Bugs (Must Fix)
- [ ] None found ✅

### High Priority Bugs (Should Fix)
- [ ] None found ✅

### Medium Priority Bugs (Nice to Fix)
- [ ] None found ✅

### Low Priority Bugs (Consider Later)
- [ ] None found ✅

---

## Summary

**Test Date:** 2025-11-23
**Tester:** Claude Code AI Assistant
**Environment:** Development (localhost:3003)
**Status:** ✅ Ready for Testing

**Recommendation:** Proceed with manual testing on real devices using this checklist.
