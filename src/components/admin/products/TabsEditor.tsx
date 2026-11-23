import React, { useRef, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface TabRow {
  id?: string;
  product_id?: string;
  title: string;
  content: string;
  display_style: "text" | "list" | "highlight";
  sort_order: number;
  _isNew?: boolean;
  _deleted?: boolean;
}

interface Props {
  tabs: TabRow[];
  onChange: (t: TabRow[]) => void;
}

const FieldLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <label className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground/80">
    {children}
  </label>
);

const TabsEditor: React.FC<Props> = ({ tabs, onChange }) => {
  const listInputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const [newTab, setNewTab] = useState<{ title: string; content: string; display_style: TabRow["display_style"] }>({
    title: "",
    content: "",
    display_style: "text",
  });

  const updateTab = (
    index: number,
    field: "title" | "content" | "display_style",
    value: string
  ) => onChange(tabs.map((t, i) => (i === index ? { ...t, [field]: value } : t)));

  const deleteTab = (index: number) => {
    const tab = tabs[index];
    if (tab._isNew) onChange(tabs.filter((_, i) => i !== index));
    else onChange(tabs.map((t, i) => (i === index ? { ...t, _deleted: true } : t)));
  };

  const addNewTab = () => {
    if (!newTab.title.trim()) return;
    onChange([
      ...tabs,
      {
        title: newTab.title.trim(),
        content: newTab.content,
        display_style: newTab.display_style,
        sort_order: tabs.length,
        _isNew: true,
      },
    ]);
    setNewTab({ title: "", content: "", display_style: "text" });
  };

  const visibleTabs = tabs.filter((t) => !t._deleted);

  return (
    <div className="space-y-4">
      {/* Existing tabs */}
      <div className="space-y-2">
        {visibleTabs.length === 0 && (
          <p className="text-[12px] text-muted-foreground/40 text-center py-4">No tabs yet</p>
        )}
        {tabs.map((tab, idx) => {
          if (tab._deleted) return null;
          const style = tab.display_style || "text";
          const isListType = style === "list" || style === "highlight";
          const lines = isListType ? (tab.content || "").split(/\n/) : [];

          return (
            <div key={tab.id ?? `new-${idx}`} className="border border-border/40 rounded-[4px] p-3 space-y-2">
              <div className="flex items-start gap-2">
                <Input
                  value={tab.title}
                  onChange={(e) => updateTab(idx, "title", e.target.value)}
                  placeholder="Tab title"
                  className="flex-1 h-9 text-[13px] font-medium rounded-[4px]"
                />
                <Select value={style} onValueChange={(v) => updateTab(idx, "display_style", v)}>
                  <SelectTrigger className="w-[130px] h-9 text-[12px] rounded-[4px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Text</SelectItem>
                    <SelectItem value="list">Simple list</SelectItem>
                    <SelectItem value="highlight">Highlight list</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteTab(idx)}
                  className="text-muted-foreground/30 hover:text-destructive h-9 w-9 p-0 shrink-0 rounded-[4px]"
                >
                  <Trash2 size={12} />
                </Button>
              </div>

              {style === "text" ? (
                <Textarea
                  value={tab.content}
                  onChange={(e) => updateTab(idx, "content", e.target.value)}
                  placeholder="Write your content..."
                  rows={3}
                  className="resize-none text-[13px] rounded-[4px]"
                />
              ) : (
                <div className="space-y-1 border border-border/30 rounded-[4px] p-2 bg-muted/10">
                  {lines.map((line, li) => (
                    <div key={li} className="flex items-center gap-1.5 group">
                      <span className="text-[10px] text-muted-foreground/30 w-3.5 text-right tabular-nums select-none">
                        {li + 1}
                      </span>
                      <div
                        className={cn(
                          "flex-1 flex items-center",
                          style === "highlight" ? "border-l-2 border-primary/30 pl-2" : ""
                        )}
                      >
                        {style === "list" && (
                          <span className="w-[3px] h-[3px] rounded-full bg-primary/40 mr-2 flex-shrink-0" />
                        )}
                        <Input
                          ref={(el) => {
                            const key = `${idx}-${li}`;
                            if (el) listInputRefs.current.set(key, el);
                            else listInputRefs.current.delete(key);
                          }}
                          value={line}
                          onChange={(e) => {
                            const newLines = [...lines];
                            newLines[li] = e.target.value;
                            updateTab(idx, "content", newLines.join("\n"));
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              const newLines = [...lines];
                              newLines.splice(li + 1, 0, "");
                              updateTab(idx, "content", newLines.join("\n"));
                              setTimeout(() => {
                                listInputRefs.current.get(`${idx}-${li + 1}`)?.focus();
                              }, 0);
                            }
                            if (e.key === "Backspace" && line === "" && lines.length > 1) {
                              e.preventDefault();
                              const newLines = lines.filter((_, i) => i !== li);
                              updateTab(idx, "content", newLines.join("\n"));
                              setTimeout(() => {
                                const prevIdx = Math.max(0, li - 1);
                                listInputRefs.current.get(`${idx}-${prevIdx}`)?.focus();
                              }, 0);
                            }
                          }}
                          className="flex-1 h-8 text-[12px] border-0 bg-transparent shadow-none focus-visible:ring-0 px-1"
                          placeholder="Type here..."
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const newLines = lines.filter((_, i) => i !== li);
                          updateTab(idx, "content", newLines.length > 0 ? newLines.join("\n") : "");
                        }}
                        className="text-muted-foreground/20 hover:text-destructive/60 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X size={10} />
                      </Button>
                    </div>
                  ))}
                  {lines.length === 0 && (
                    <button
                      type="button"
                      onClick={() => updateTab(idx, "content", "")}
                      className="text-[11px] text-muted-foreground/50 hover:text-foreground py-1 px-1"
                    >
                      Click to add items…
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add a tab */}
      <div className="border-t border-border/40 pt-4 space-y-2">
        <FieldLabel>Add a tab</FieldLabel>
        <div className="grid grid-cols-[1fr_130px_auto] gap-2">
          <Input
            placeholder="Tab title"
            value={newTab.title}
            onChange={(e) => setNewTab({ ...newTab, title: e.target.value })}
            className="h-9 text-[13px] rounded-[4px]"
          />
          <Select value={newTab.display_style} onValueChange={(v: any) => setNewTab({ ...newTab, display_style: v })}>
            <SelectTrigger className="h-9 text-[12px] rounded-[4px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="text">Text</SelectItem>
              <SelectItem value="list">Simple list</SelectItem>
              <SelectItem value="highlight">Highlight list</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" className="h-9 rounded-[4px]" onClick={addNewTab}>
            <Plus size={13} className="mr-1" /> Add
          </Button>
        </div>
        <Textarea
          placeholder={newTab.display_style === "text" ? "Content (optional)" : "One item per line (optional)"}
          value={newTab.content}
          onChange={(e) => setNewTab({ ...newTab, content: e.target.value })}
          rows={2}
          className="resize-none text-[13px] rounded-[4px]"
        />
      </div>
    </div>
  );
};

export default TabsEditor;
