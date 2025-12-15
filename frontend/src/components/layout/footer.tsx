
export function Footer() {
  return (
    <footer className="border-t border-border/50 py-6 md:py-8">
      <div className="container">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Logo and copyright */}
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-6 h-6 rounded-md bg-primary/10 text-primary font-bold text-xs">
              TC
            </div>
            <span className="text-sm text-muted-foreground">
              TradeCode
            </span>
          </div>

          {/* Copyright */}
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} TradeCode. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}
