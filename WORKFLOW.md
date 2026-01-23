# Synchronized Workflow: User + Claude Code + Browser

This guide explains how to get everyone (you, Claude Code, and the browser) working on the same 3D model with automatic synchronization.

## 🚀 The Magic Command

```bash
npm run work my-gear
```

This single command:
1. ✅ Creates the model file if it doesn't exist
2. ✅ Shows you the exact URL to open
3. ✅ Tells Claude Code which file to work on
4. ✅ Everyone stays synchronized!

## 📋 Complete Workflow

### Step 1: Start the Viewer (Once)

Open a terminal and run:

```bash
cd /home/john/src/jscad-ai-studio
npm run dev
```

**Keep this terminal running!** The viewer will start at **http://127.0.0.1:5120**

### Step 2: Set Up Your Model

```bash
npm run work my-gear
```

You'll see output like:

```
═══════════════════════════════════════════════════════════

  Working on: my-gear.js

  1. Make sure the viewer is running:
     npm run dev

  2. Open this URL in your browser:
     http://127.0.0.1:5120#/home/john/src/jscad-ai-studio/workspace/my-gear.js

  3. Edit the file:
     /home/john/src/jscad-ai-studio/workspace/my-gear.js

  4. Tell Claude Code:
     "Work on my-gear.js" or just "continue"

═══════════════════════════════════════════════════════════
```

### Step 3: Open in Browser

Copy the URL from the output and open it in your browser:

```
http://127.0.0.1:5120#/home/john/src/jscad-ai-studio/workspace/my-gear.js
```

**Keep this tab open!** It will auto-reload when the file changes.

### Step 4: Tell Claude Code

In your conversation with Claude Code, simply say:

> "Work on my-gear.js"

or just:

> "Continue"

Claude Code will automatically:
- ✅ Check `.current-model` to see what you're working on
- ✅ Read/edit the correct file
- ✅ Use the same viewer URL you have open
- ✅ Use MCP browser tools to verify changes
- ✅ See exactly what you see!

### Step 5: Code Together!

Now you can:
- **Edit the file** in your editor
- **Ask Claude Code** to make changes
- **Watch the browser** update automatically
- **See console output** for errors and measurements

**Everyone sees the same thing in real-time!**

## 🎯 Example Session

```bash
# Terminal 1: Start viewer
npm run dev

# Terminal 2: Set up model
npm run work gear-with-teeth

# Browser: Open the URL shown
# (It auto-opens if you click it in the terminal)

# Claude Code conversation:
You: "Create a gear with 12 teeth"
Claude: [reads .current-model, edits gear-with-teeth.js, uses browser tools to verify]

# Browser: Automatically shows the new gear!

You: "Make the teeth bigger"
Claude: [edits the file again]

# Browser: Updates immediately!
```

## 🔄 How Synchronization Works

1. **`npm run work <name>`** creates a `.current-model` file containing:
   ```json
   {
     "name": "my-gear",
     "file": "my-gear.js",
     "path": "/home/john/src/jscad-ai-studio/workspace/my-gear.js",
     "viewerUrl": "http://127.0.0.1:5120#/home/john/src/jscad-ai-studio/workspace/my-gear.js"
   }
   ```

2. **Claude Code** reads this file to know:
   - Which file to edit
   - Which URL to navigate the browser to
   - What model you're expecting to see

3. **The browser** watches the file and auto-reloads when it changes

4. **You, Claude, and the browser** are all looking at the same model!

## 💡 Pro Tips

### Switch Models

```bash
npm run work another-model
```

Claude Code will pick up the new model automatically!

### Use Templates

```bash
npm run work my-box parametric-model
```

Available templates:
- `basic-model` (default)
- `parametric-model` - With interactive sliders
- `multi-part` - Assembly with multiple objects

### Check What You're Working On

```bash
cat .current-model
```

### Manual Workflow (Without `npm run work`)

If you prefer to do it manually:

1. Create the file: `workspace/my-model.js`
2. Open browser to: `http://127.0.0.1:5120#/full/path/to/workspace/my-model.js`
3. Tell Claude: "Work on workspace/my-model.js at http://127.0.0.1:5120#..."

## 🐛 Troubleshooting

### "I don't see my model in the browser"

- Make sure the viewer is running (`npm run dev`)
- Check the URL matches exactly (including the `#` and full path)
- Check browser console for errors (F12)

### "Claude Code is editing the wrong file"

- Run `npm run work <model-name>` to update `.current-model`
- Or explicitly tell Claude: "Work on workspace/my-model.js"

### "Changes aren't showing up"

- Check that the file path in the browser URL is correct
- Look for syntax errors in browser console
- Make sure the file exports `module.exports = { main }`

### "Browser console shows errors"

That's good! Claude Code will:
- Read those errors via `browser_console_messages()`
- Fix the issues
- Reload and verify

## 📚 Next Steps

- Read `CLAUDE.md` for Claude Code workflow details
- Check `llm.txt` for complete API reference
- Browse `examples/` for inspiration
- See `README.md` for comprehensive documentation

Happy synchronized modeling! 🎨🤖
