import * as React from "react";
import { Magnifier, Xmark } from "@gravity-ui/icons";
import { cn } from "@/lib/utils";

const SearchFieldContext = React.createContext({
  value: "",
  onChange: undefined,
  onClear: undefined,
});

export const SearchField = ({ children, className, value, onChange, onClear, _ariaLabel, ...props }) => {
  const contextValue = React.useMemo(() => ({ value, onChange, onClear }), [value, onChange, onClear]);
  return (
    <SearchFieldContext.Provider value={contextValue}>
      <div className={cn("relative w-full max-w-sm", className)} {...props}>
        {children}
      </div>
    </SearchFieldContext.Provider>
  );
};

SearchField.Group = ({ children, className }) => (
  <div className={cn("relative flex items-center w-full", className)}>{children}</div>
);

SearchField.SearchIcon = ({ className }) => (
  <Magnifier className={cn("absolute left-3 h-4 w-4 text-muted-foreground pointer-events-none", className)} />
);

SearchField.Input = React.forwardRef(({ className, placeholder = "Buscar...", value: propValue, onChange: propOnChange, ...props }, ref) => {
  const ctx = React.useContext(SearchFieldContext);
  const inputValue = propValue !== undefined ? propValue : (ctx.value || "");
  const handleChange = (e) => {
    if (propOnChange) propOnChange(e);
    if (ctx.onChange) {
      ctx.onChange(typeof e === "string" ? e : e?.target?.value ?? e);
    }
  };

  return (
    <input
      ref={ref}
      type="search"
      placeholder={placeholder}
      value={inputValue}
      onChange={handleChange}
      className={cn(
        "flex h-9 w-full rounded-md border border-input bg-transparent pl-9 pr-8 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
});
SearchField.Input.displayName = "SearchField.Input";

SearchField.ClearButton = ({ className, onClick, ...props }) => {
  const ctx = React.useContext(SearchFieldContext);
  const handleClick = (e) => {
    if (onClick) onClick(e);
    if (ctx.onClear) ctx.onClear();
    else if (ctx.onChange) ctx.onChange("");
  };

  if (!ctx.value) return null;

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn("absolute right-2.5 text-muted-foreground hover:text-foreground cursor-pointer", className)}
      {...props}
    >
      <Xmark className="h-4 w-4" />
    </button>
  );
};
