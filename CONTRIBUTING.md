
# Contributing to Gemma Voice Desktop Operator

Thank you for your interest in contributing to **Gemma Voice Desktop Operator**! We welcome contributions from developers, researchers, and system tinkerers to expand the capabilities of this on-device, voice-controlled OS agent.

---

## 🚀 Quick Start & Local Setup

### Prerequisites
- **Rust Toolchain:** Stable 1.75+ (`rustup update stable`)
- **Ollama:** Installed locally (`ollama serve`)
- **Gemma Model:** Pulled locally via Ollama (`ollama run gemma`)
- **OS Permissions:**
  - **macOS:** Grant `Accessibility` and `Input Monitoring` permissions to your terminal/IDE in *System Settings > Privacy & Security*.
  - **Linux:** Ensure X11 or Wayland developer packages (`libxtst-dev`, `libx11-dev`, `libevdev-dev`) are installed for `enigo`.
  - **Windows:** Run terminal as Administrator if interacting with elevated system windows.

---

## 🛠️ How to Contribute

### 1. Adding New OS Action Commands

Our schema maps Gemma JSON outputs directly to `enigo` execution. To add a new action (e.g., drag-and-drop, hotkeys, scroll):

1. Update the `OSCommand` enum in `src/actions.rs`.
2. Add the corresponding `enigo` execution logic in `execute_action()`.
3. Update the Gemma system prompt instructions in `src/prompt.rs` to inform the model of the new JSON format.

### 2. Improving Gemma JSON Tool Output

If you find Gemma returning malformed JSON or failing specific intent parses, submit an issue or PR updating the system prompt or adding output-sanitization guards in `src/parser.rs`.

### 3. Voice & STT Engine Integration

We welcome PRs that add alternative offline STT backends (e.g., `whisper-rs`) or alternative Google STT streaming drivers.

---

## 📋 Pull Request Process

1. **Fork the repo** and create your branch from `main`:
```bash
git checkout -b feature/your-feature-name

```


2. **Format and lint your code:**
```bash
cargo fmt --all
cargo clippy -- -D warnings

```


3. **Ensure safety boundaries:** Verify that synthetic `enigo` inputs do not cause out-of-bounds mouse coordinates or unintended destructive system actions.
4. **Submit a Pull Request** with a clear description of the feature or bug fix and a demo GIF/screenshot if visual UI automation was modified.

---

## 📜 Code of Conduct & License

* By contributing, you agree that your contributions will be licensed under the project's **MIT / Apache-2.0 License**.
* Please keep discussions in issues and PRs constructive, welcoming, and focused on systems engineering.


<ElicitationsGroup message="Next steps for your hackathon workspace:">
  <Elicitation label="Create README.md template" query="Provide a complete high-impact README.md template for the Gemma Voice Desktop Operator project."/>
  <Elicitation label="Review Rust file structure" query="Show me the optimal Rust src/ directory module layout for this hackathon repo."/>
</ElicitationsGroup>

```
