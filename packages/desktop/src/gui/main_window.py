"""Main GUI window for Hasod Downloads."""
import customtkinter as ctk
import threading
import time
from pathlib import Path
import pyperclip
from PIL import Image
import sys
import os

try:
    from tkinterdnd2 import DND_FILES, DND_TEXT, DND_ALL, TkinterDnD
    TKINTERDND_AVAILABLE = True
    print("[INFO] tkinterdnd2 loaded successfully")
except ImportError:
    TKINTERDND_AVAILABLE = False
    DND_ALL = None
    print("[WARNING] tkinterdnd2 not available - drag and drop will be limited")

# Try to import pyobjc for macOS window level control
try:
    from AppKit import (NSWindow, NSFloatingWindowLevel, NSScreenSaverWindowLevel,
                        NSWindowCollectionBehaviorCanJoinAllSpaces,
                        NSWindowCollectionBehaviorFullScreenAuxiliary)
    try:
        from Quartz import CGWindowLevelForKey, kCGMaximumWindowLevelKey
        HAS_QUARTZ = True
    except ImportError:
        HAS_QUARTZ = False
        print("[WARNING] Quartz not available - using fallback window levels")
    PYOBJC_AVAILABLE = True
    print("[INFO] pyobjc available - true always-on-top enabled")
except ImportError:
    PYOBJC_AVAILABLE = False
    HAS_QUARTZ = False
    print("[WARNING] pyobjc not available - limited always-on-top support")

from ..downloaders.download_manager import DownloadManager, DownloadTask
from ..utils.url_parser import URLParser, Platform
from ..utils.config import config


# Create custom CTk class with drag-and-drop support
if TKINTERDND_AVAILABLE:
    class CTkDnD(ctk.CTk, TkinterDnD.DnDWrapper):
        """CustomTkinter window with drag-and-drop support."""
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            self.TkdndVersion = TkinterDnD._require(self)
else:
    # Fallback to regular CTk if tkinterdnd2 is not available
    CTkDnD = ctk.CTk


class MainWindow(CTkDnD):
    """Main application window."""

    def __init__(self):
        """Initialize main window."""
        super().__init__()

        # Window configuration
        self.title("Hasod Downloads")
        self.geometry("800x600")
        self.minsize(600, 500)

        # Set theme
        ctk.set_appearance_mode(config.get('theme', 'dark'))
        ctk.set_default_color_theme("blue")

        # Initialize download manager
        self.download_manager = DownloadManager()

        # Create UI
        self._create_ui()

        # Setup drag and drop
        self._setup_drag_drop()

        # Start status update loop (on main thread using after())
        self.is_running = True
        self._schedule_status_update()

        # Handle window close
        self.protocol("WM_DELETE_WINDOW", self._on_close)

        # Create PySide6 floating drop button
        self._create_floating_button_qt()

    def _create_floating_button_qt(self):
        """Create PySide6 floating button with true always-on-top support."""
        from .floating_button_qt import run_floating_button_app

        # Get icon path
        project_root = Path(__file__).parent.parent.parent
        icon_path = project_root / "icon.png"
        icon_path_str = str(icon_path) if icon_path.exists() else None

        # Create PySide6 button
        self.qt_app, self.floating_button = run_floating_button_app(
            icon_path=icon_path_str,
            on_url_dropped=self._on_qt_url_dropped,
            on_button_clicked=self._on_qt_button_clicked
        )

        # Process Qt events periodically (integrate with Tkinter event loop)
        def process_qt_events():
            if self.is_running and hasattr(self, 'qt_app'):
                try:
                    self.qt_app.processEvents()
                    self.after(10, process_qt_events)  # Check Qt events every 10ms
                except:
                    pass

        self.after(10, process_qt_events)

    def _on_qt_url_dropped(self, url):
        """Handle URL dropped on PySide6 button."""
        print(f"[QT CALLBACK] URL dropped: {url}")

        # Schedule all Tkinter updates on the main thread to avoid GIL issues
        def update_ui():
            # Set URL in entry
            self.url_entry.delete(0, 'end')
            self.url_entry.insert(0, url)

            # Validate and auto-start download
            if URLParser.is_valid(url):
                platform, _ = URLParser.parse(url)
                self._show_status(f"✓ Valid {platform.value} URL dropped - starting download...")
                print(f"[SUCCESS] Valid {platform.value} URL dropped - auto-starting download!")

                # Auto-start the download
                self.after(100, self._add_download)
            else:
                self._show_status("URL detected - verify before downloading", error=False)
                print(f"[WARNING] Dropped data may not be a valid URL, please verify")

            # Show main window
            self._show_main_window()

        # Execute on main thread
        self.after(0, update_ui)

    def _on_qt_button_clicked(self):
        """Handle PySide6 button clicked."""
        print("[QT CALLBACK] Button clicked")
        # Schedule on main thread to avoid GIL issues
        self.after(0, self._show_main_window)

    # LEGACY: Keep old Tkinter floating button code for reference (not used)
    def _create_floating_button_tkinter(self):
        """DEPRECATED: Old Tkinter implementation (kept for reference only)."""
        # Create a new top-level window for the floating button
        self.floating_window = ctk.CTkToplevel(self)
        self.floating_window.title("Hasod Drop")

        # Remove window decorations for a clean look
        self.floating_window.overrideredirect(True)

        # Make it stay on top of ALL windows including fullscreen
        self.floating_window.attributes('-topmost', True)

        # On macOS, set the window level to floating to stay above fullscreen apps
        try:
            # This makes it float above everything, including fullscreen apps
            self.floating_window.lift()
            self.floating_window.attributes('-topmost', 1)

            # Use pyobjc to set NSFloatingWindowLevel for true always-on-top (macOS only)
            if PYOBJC_AVAILABLE and sys.platform == 'darwin':
                # Delay setting window level until window is fully created
                def set_window_level():
                    try:
                        # Import additional modules for NSWindow access
                        from Cocoa import NSApp, NSWindow
                        import objc

                        # Force window update
                        self.floating_window.update_idletasks()

                        # Try to get NSWindow by iterating all windows
                        nswindow = None
                        for window in NSApp.windows():
                            # Check if this is our floating window by checking its frame
                            # Our window should be around x_position, y_position
                            frame = window.frame()
                            if hasattr(self, 'floating_window'):
                                try:
                                    x = self.floating_window.winfo_x()
                                    y = self.floating_window.winfo_y()
                                    # Check if frame matches our window position (with tolerance)
                                    if abs(frame.origin.x - x) < 10:
                                        nswindow = window
                                        break
                                except:
                                    pass

                        # If we still can't find it, try getting the frontmost borderless window
                        if not nswindow:
                            for window in NSApp.windows():
                                # Our window has no title bar (overrideredirect)
                                if window.styleMask() == 0:
                                    nswindow = window
                                    break

                        # If we found the window, set its level and behaviors
                        if nswindow and not nswindow.isMiniaturized() and nswindow.isVisible():
                            # Try maximum window level first (works best for fullscreen)
                            if HAS_QUARTZ:
                                from Quartz import CGWindowLevelForKey, kCGMaximumWindowLevelKey
                                max_level = CGWindowLevelForKey(kCGMaximumWindowLevelKey)
                                nswindow.setLevel_(max_level)
                                print(f"[SUCCESS] Set floating window to kCGMaximumWindowLevelKey ({max_level})")
                            else:
                                # Fallback to screen saver level (higher than floating)
                                nswindow.setLevel_(NSScreenSaverWindowLevel)
                                print(f"[SUCCESS] Set floating window to NSScreenSaverWindowLevel ({NSScreenSaverWindowLevel})")

                            # CRITICAL: Enable fullscreen space-joining and all-spaces visibility
                            # This is what makes the window appear above fullscreen apps
                            behavior = (NSWindowCollectionBehaviorCanJoinAllSpaces |
                                       NSWindowCollectionBehaviorFullScreenAuxiliary)
                            nswindow.setCollectionBehavior_(behavior)
                            print(f"[SUCCESS] Set collection behavior to {behavior} (CanJoinAllSpaces | FullScreenAuxiliary)")

                            # Prevent window from hiding when app loses focus
                            nswindow.setHidesOnDeactivate_(False)

                            # Re-order window to front
                            nswindow.orderFront_(None)

                            print("[SUCCESS] Floating window configured for fullscreen overlay!")
                        else:
                            print(f"[WARNING] Could not find NSWindow - falling back to perpetual lift")
                            raise Exception("NSWindow not found")

                    except Exception as e:
                        print(f"[WARNING] Could not set NSFloatingWindowLevel: {e}")
                        # Fallback to perpetual lift
                        def keep_on_top():
                            if self.is_running and hasattr(self, 'floating_window'):
                                try:
                                    self.floating_window.lift()
                                    self.floating_window.attributes('-topmost', True)
                                    self.after(500, keep_on_top)
                                except:
                                    pass
                        self.after(500, keep_on_top)

                # Set window level after 500ms to ensure window is fully created
                self.after(500, set_window_level)
            else:
                # Fallback: Keep it on top perpetually (limited support)
                def keep_on_top():
                    if self.is_running and hasattr(self, 'floating_window'):
                        try:
                            self.floating_window.lift()
                            self.floating_window.attributes('-topmost', True)
                            self.after(500, keep_on_top)  # Re-lift every 500ms
                        except:
                            pass

                self.after(500, keep_on_top)
        except Exception as e:
            print(f"[WARNING] Could not set floating window level: {e}")

        # Set size and initial position (top-right corner)
        button_width = 120
        button_height = 120
        screen_width = self.floating_window.winfo_screenwidth()
        x_position = screen_width - button_width - 20
        y_position = 100

        self.floating_window.geometry(f"{button_width}x{button_height}+{x_position}+{y_position}")

        # Load icon image
        icon_image = None
        try:
            # Get the project root directory
            project_root = Path(__file__).parent.parent.parent
            icon_path = project_root / "icon.png"

            if icon_path.exists():
                # Load and resize icon for button
                pil_image = Image.open(icon_path)
                icon_image = ctk.CTkImage(pil_image, size=(60, 60))
                print(f"[SUCCESS] Loaded icon from {icon_path}")
            else:
                print(f"[WARNING] Icon not found at {icon_path}")
        except Exception as e:
            print(f"[WARNING] Could not load icon: {e}")

        # Create the button with icon
        if icon_image:
            self.floating_btn = ctk.CTkButton(
                self.floating_window,
                text="Hasod",
                image=icon_image,
                width=button_width,
                height=button_height,
                corner_radius=60,  # Very rounded for circular look
                font=ctk.CTkFont(size=16, weight="bold"),
                fg_color=("#3B8ED0", "#1F6AA5"),  # Blue gradient
                hover_color=("#36719F", "#144870"),
                compound="top",  # Image on top, text below
                command=self._show_main_window
            )
        else:
            # Fallback without icon
            self.floating_btn = ctk.CTkButton(
                self.floating_window,
                text="🎵\nHasod",
                width=button_width,
                height=button_height,
                corner_radius=60,  # Very rounded for circular look
                font=ctk.CTkFont(size=20, weight="bold"),
                fg_color=("#3B8ED0", "#1F6AA5"),  # Blue gradient
                hover_color=("#36719F", "#144870"),
                command=self._show_main_window
            )
        self.floating_btn.pack(fill="both", expand=True)

        # Enable drag and drop on floating button
        if TKINTERDND_AVAILABLE:
            try:
                drag_types = [
                    DND_FILES, DND_TEXT, DND_ALL,
                    'text/uri-list', 'text/plain', 'public.url',
                    'public.file-url', 'com.apple.safari.bookmark',
                    'NSStringPboardType', 'NSURLPboardType', '*'
                ]
                self.floating_window.drop_target_register(*drag_types)
                self.floating_window.dnd_bind('<<Drop>>', self._on_floating_drop)
                self.floating_window.dnd_bind('<<DropEnter>>', self._on_floating_drop_enter)
                self.floating_window.dnd_bind('<<DropLeave>>', self._on_floating_drop_leave)
                print("[INFO] Floating button drag-and-drop enabled")
            except Exception as e:
                print(f"[WARNING] Could not enable drag-and-drop on floating button: {e}")

        # Make the button draggable
        self.floating_btn.bind('<Button-1>', self._start_drag_floating)
        self.floating_btn.bind('<B1-Motion>', self._drag_floating)

        # Store drag offset
        self._drag_offset_x = 0
        self._drag_offset_y = 0

        print("[INFO] Floating drop button created")

    def _start_drag_floating(self, event):
        """Start dragging the floating button."""
        self._drag_offset_x = event.x
        self._drag_offset_y = event.y

    def _drag_floating(self, event):
        """Drag the floating button around the screen."""
        x = self.floating_window.winfo_x() + event.x - self._drag_offset_x
        y = self.floating_window.winfo_y() + event.y - self._drag_offset_y
        self.floating_window.geometry(f"+{x}+{y}")

    def _on_floating_drop(self, event):
        """Handle drop on floating button."""
        print(f"[FLOATING DROP] URL dropped on floating button!")

        # Process the drop the same way as main window
        self._on_drop(event)

        # Show main window after drop
        self._show_main_window()

        # Reset button appearance
        self.floating_btn.configure(fg_color=("#3B8ED0", "#1F6AA5"))

    def _on_floating_drop_enter(self, event):
        """Handle drag enter on floating button."""
        print(f"[FLOATING DROP ENTER] Drag over floating button")
        self.floating_btn.configure(fg_color=("#2ECC71", "#27AE60"))  # Green when hovering
        return event.action

    def _on_floating_drop_leave(self, event):
        """Handle drag leave on floating button."""
        print(f"[FLOATING DROP LEAVE] Drag left floating button")
        self.floating_btn.configure(fg_color=("#3B8ED0", "#1F6AA5"))  # Back to blue
        return event.action

    def _show_main_window(self):
        """Show and focus the main window."""
        self.deiconify()  # Show window if minimized
        self.lift()  # Bring to front
        self.focus_force()  # Force focus

    def _create_ui(self):
        """Create the user interface."""
        # Configure grid
        self.grid_columnconfigure(0, weight=1)
        self.grid_rowconfigure(1, weight=1)

        # Header frame
        self._create_header()

        # Main content frame
        self._create_main_content()

        # Status bar
        self._create_status_bar()

    def _create_header(self):
        """Create header with title and controls."""
        header = ctk.CTkFrame(self, fg_color="transparent")
        header.grid(row=0, column=0, padx=20, pady=(20, 10), sticky="ew")
        header.grid_columnconfigure(1, weight=1)

        # Title
        title = ctk.CTkLabel(
            header,
            text="🎵 Hasod Downloads",
            font=ctk.CTkFont(size=28, weight="bold")
        )
        title.grid(row=0, column=0, sticky="w")

        # Settings button
        settings_btn = ctk.CTkButton(
            header,
            text="⚙️ Settings",
            width=100,
            command=self._open_settings
        )
        settings_btn.grid(row=0, column=2, padx=5)

        # Open folder button
        folder_btn = ctk.CTkButton(
            header,
            text="📁 Open Folder",
            width=120,
            command=self._open_downloads_folder
        )
        folder_btn.grid(row=0, column=3)

    def _create_main_content(self):
        """Create main content area."""
        content = ctk.CTkFrame(self)
        content.grid(row=1, column=0, padx=20, pady=10, sticky="nsew")
        content.grid_columnconfigure(0, weight=1)
        content.grid_rowconfigure(2, weight=1)

        # URL input section
        input_label = ctk.CTkLabel(
            content,
            text="Copy, paste, or drag a link from YouTube, Spotify, or SoundCloud to start downloading:",
            font=ctk.CTkFont(size=14)
        )
        input_label.grid(row=0, column=0, pady=(10, 5), sticky="w", padx=15)

        # URL entry frame
        self.entry_frame = ctk.CTkFrame(content)
        self.entry_frame.grid(row=1, column=0, pady=5, padx=15, sticky="ew")
        self.entry_frame.grid_columnconfigure(0, weight=1)

        self.url_entry = ctk.CTkEntry(
            self.entry_frame,
            placeholder_text="https://youtube.com/watch?v=... or spotify:track:...",
            height=40,
            font=ctk.CTkFont(size=13)
        )
        self.url_entry.grid(row=0, column=0, padx=(10, 5), pady=10, sticky="ew")
        self.url_entry.bind("<Return>", lambda e: self._add_download())

        download_btn = ctk.CTkButton(
            self.entry_frame,
            text="Download",
            width=120,
            height=40,
            command=self._add_download,
            font=ctk.CTkFont(size=13, weight="bold")
        )
        download_btn.grid(row=0, column=1, padx=(5, 10), pady=10)

        # Downloads list
        list_label = ctk.CTkLabel(
            content,
            text="Downloads:",
            font=ctk.CTkFont(size=14, weight="bold")
        )
        list_label.grid(row=2, column=0, pady=(15, 5), sticky="w", padx=15)

        # Scrollable frame for downloads
        self.downloads_frame = ctk.CTkScrollableFrame(content, fg_color="transparent")
        self.downloads_frame.grid(row=3, column=0, padx=15, pady=(0, 15), sticky="nsew")
        self.downloads_frame.grid_columnconfigure(0, weight=1)

        # Placeholder text
        self.placeholder_label = ctk.CTkLabel(
            self.downloads_frame,
            text="No downloads yet. Add a link above to get started!",
            font=ctk.CTkFont(size=13),
            text_color="gray"
        )
        self.placeholder_label.grid(row=0, column=0, pady=20)

        # Download widgets list
        self.download_widgets = {}

    def _create_status_bar(self):
        """Create status bar at bottom."""
        status_bar = ctk.CTkFrame(self, height=35, fg_color=("gray85", "gray20"))
        status_bar.grid(row=2, column=0, sticky="ew")
        status_bar.grid_columnconfigure(1, weight=1)
        status_bar.grid_propagate(False)

        self.status_label = ctk.CTkLabel(
            status_bar,
            text="Ready",
            font=ctk.CTkFont(size=12)
        )
        self.status_label.grid(row=0, column=0, padx=20, pady=7, sticky="w")

        self.queue_label = ctk.CTkLabel(
            status_bar,
            text="Queue: 0",
            font=ctk.CTkFont(size=12)
        )
        self.queue_label.grid(row=0, column=2, padx=20, pady=7, sticky="e")

    def _add_download(self):
        """Add download from URL entry."""
        url = self.url_entry.get().strip()
        print(f"[DEBUG] _add_download called with URL: {url}")

        if not url:
            self._show_status("Please enter a URL", error=True)
            return

        # Validate URL
        is_valid = URLParser.is_valid(url)
        print(f"[DEBUG] URL validation result: {is_valid}")

        if not is_valid:
            self._show_status("Invalid URL. Supported: YouTube, Spotify, SoundCloud", error=True)
            return

        # Add to download manager
        print(f"[DEBUG] Adding to download manager...")
        task = self.download_manager.add_download(url)
        print(f"[DEBUG] Task created: {task}")

        if task:
            self._show_status(f"Added to queue: {task.platform.value}")
            self.url_entry.delete(0, 'end')
            self._create_download_widget(task)
            print(f"[DEBUG] Widget created for task")

            # Hide placeholder
            if self.placeholder_label.winfo_exists():
                self.placeholder_label.grid_remove()
        else:
            self._show_status("Failed to add download", error=True)

    def _create_download_widget(self, task: DownloadTask):
        """Create widget for download task."""
        # Container frame
        frame = ctk.CTkFrame(self.downloads_frame)
        frame.grid(row=len(self.download_widgets), column=0, pady=5, padx=5, sticky="ew")
        frame.grid_columnconfigure(0, weight=1)

        # Platform and URL
        platform_label = ctk.CTkLabel(
            frame,
            text=f"[{task.platform.value.upper()}] {task.url[:60]}...",
            font=ctk.CTkFont(size=12),
            anchor="w"
        )
        platform_label.grid(row=0, column=0, padx=10, pady=(10, 5), sticky="w")

        # Progress bar
        progress_bar = ctk.CTkProgressBar(frame, mode="determinate")
        progress_bar.set(0)
        progress_bar.grid(row=1, column=0, padx=10, pady=5, sticky="ew")

        # Status label
        status_label = ctk.CTkLabel(
            frame,
            text="Pending...",
            font=ctk.CTkFont(size=11),
            text_color="gray",
            anchor="w"
        )
        status_label.grid(row=2, column=0, padx=10, pady=(5, 10), sticky="w")

        # Store widgets
        self.download_widgets[id(task)] = {
            'frame': frame,
            'progress_bar': progress_bar,
            'status_label': status_label,
            'task': task
        }

    def _schedule_status_update(self):
        """Schedule the next status update on the main thread."""
        if self.is_running:
            self._update_status()
            # Schedule next update in 500ms
            self.after(500, self._schedule_status_update)

    def _update_status(self):
        """Update download status (runs on main thread)."""
        try:
            # Update each download widget
            for task_id, widgets in self.download_widgets.items():
                task = widgets['task']
                progress_bar = widgets['progress_bar']
                status_label = widgets['status_label']

                # Update progress
                progress = task.progress / 100.0
                progress_bar.set(progress)

                # Update status text
                status_label.configure(text=task.message)

                # Update color based on status
                if task.status == "completed":
                    status_label.configure(text_color="green")
                elif task.status == "error":
                    status_label.configure(text_color="red")
                elif task.status == "downloading":
                    status_label.configure(text_color="yellow")

            # Update queue count
            queue_size = self.download_manager.get_queue_size()
            self.queue_label.configure(text=f"Queue: {queue_size}")
        except Exception as e:
            print(f"Update error: {e}")

    def _show_status(self, message: str, error: bool = False):
        """Show status message."""
        color = "red" if error else None
        if color:
            self.status_label.configure(text=message, text_color=color)
        else:
            self.status_label.configure(text=message)

    def _setup_drag_drop(self):
        """Setup drag-and-drop functionality."""
        if TKINTERDND_AVAILABLE:
            # Enable drag and drop with tkinterdnd2
            try:
                # Register ALL possible types including macOS-specific ones for browser URL drops
                # macOS browsers use: text/uri-list, text/plain, public.url, com.apple.safari.bookmark
                # We also add DND_ALL and wildcard to catch everything for debugging
                drag_types = [
                    DND_FILES,           # Standard file drops
                    DND_TEXT,            # Standard text drops
                    DND_ALL,             # All standard types
                    'text/uri-list',     # URL list (Chrome, Firefox)
                    'text/plain',        # Plain text
                    'public.url',        # macOS Safari URL
                    'public.file-url',   # macOS file URL
                    'com.apple.safari.bookmark',  # Safari bookmark
                    'NSStringPboardType', # macOS string pasteboard
                    'NSURLPboardType',    # macOS URL pasteboard
                    '*'                  # Wildcard to catch any unmatched types
                ]

                # Register drop target with all types
                self.drop_target_register(*drag_types)

                # Bind drag-and-drop events
                self.dnd_bind('<<Drop>>', self._on_drop)
                self.dnd_bind('<<DropEnter>>', self._on_drop_enter)
                self.dnd_bind('<<DropLeave>>', self._on_drop_leave)
                self.dnd_bind('<<DropPosition>>', self._on_drop_position)

                # Log success
                print("[SUCCESS] Drag and drop enabled with comprehensive macOS type support")
                print(f"[DEBUG] Registered types: {', '.join(str(t) for t in drag_types)}")
                print("[DEBUG] Try dragging a URL from Safari/Chrome/Spotify to the window")
                print("[DEBUG] Watch console for detailed event information")

                # Verify TkDnD version
                try:
                    tkdnd_version = self.tk.call('package', 'require', 'tkdnd')
                    print(f"[INFO] TkDnD library version: {tkdnd_version}")
                except Exception as e:
                    print(f"[WARNING] Could not query TkDnD version: {e}")

            except Exception as e:
                print(f"[ERROR] Could not enable drag and drop: {e}")
                import traceback
                traceback.print_exc()

        # Always enable clipboard monitoring as backup
        self._setup_clipboard_monitoring()

        # Bind paste events to auto-detect URLs
        self.url_entry.bind('<Command-v>', self._on_paste)
        self.url_entry.bind('<Control-v>', self._on_paste)

    def _setup_clipboard_monitoring(self):
        """Setup clipboard monitoring as fallback."""
        self.last_clipboard = ""
        self.clipboard_check_enabled = True

        # Monitor on window focus
        self.bind("<FocusIn>", self._on_window_focus)

        # Also monitor periodically when app is active
        self._start_clipboard_polling()

        print("[DEBUG] Clipboard monitoring enabled with polling")

    def _start_clipboard_polling(self):
        """Start polling clipboard every second."""
        def poll():
            if self.is_running:
                self._check_clipboard()
                self.after(1000, poll)  # Check every second

        # Start polling
        self.after(1000, poll)

    def _check_clipboard(self):
        """Check clipboard for valid URLs."""
        try:
            clipboard_text = pyperclip.paste()

            # Check if clipboard changed and contains a valid URL
            if (clipboard_text != self.last_clipboard and
                clipboard_text and
                URLParser.is_valid(clipboard_text.strip())):

                # Auto-fill the entry if it's empty and auto-start download
                current_text = self.url_entry.get().strip()
                if not current_text:
                    self.url_entry.delete(0, 'end')
                    self.url_entry.insert(0, clipboard_text.strip())
                    platform, _ = URLParser.parse(clipboard_text.strip())
                    self._show_status(f"✓ {platform.value.title()} URL from clipboard - starting download...")
                    print(f"[DEBUG] Auto-filled URL from clipboard: {clipboard_text.strip()}")

                    # Auto-start the download
                    self.after(200, self._add_download)  # Small delay to ensure UI updates

                self.last_clipboard = clipboard_text
        except Exception as e:
            # Silently fail - clipboard might be empty or contain non-text
            pass

    def _on_window_focus(self, event):
        """Check clipboard when window receives focus."""
        self._check_clipboard()

    def _on_drop(self, event):
        """Handle drop event."""
        # Reset drag flag
        if hasattr(self, '_drag_in_progress'):
            delattr(self, '_drag_in_progress')

        try:
            # Get dropped data
            data = event.data
            print(f"\n[DROP EVENT] ========== URL DROPPED ==========")
            print(f"[DEBUG] Raw event data: {repr(data)}")
            print(f"[DEBUG] Event widget: {event.widget}")
            print(f"[DEBUG] Event action: {event.action}")

            # Try to get data type information
            if hasattr(event, 'types'):
                print(f"[DEBUG] Data types: {event.types}")
            if hasattr(event, 'type'):
                print(f"[DEBUG] Event type: {event.type}")

            # Parse dropped data - can be multiple files or a single URL
            # Format: '{path1} {path2}' for multiple files or just 'url' for URLs
            items = data.strip('{}').split('} {')

            # Get the first item (we only process one URL at a time)
            url = items[0] if items else data

            # Clean up the URL
            url = url.strip()

            print(f"[DEBUG] After initial cleanup: {repr(url)}")

            # Handle macOS file:// URLs
            if url.startswith('file://'):
                url = url[7:]
                print(f"[DEBUG] Stripped file:// prefix: {repr(url)}")

            # Clean up any remaining quotes and braces
            url = url.strip('"').strip("'").strip('{}').strip()

            print(f"[DEBUG] Final cleaned URL: {repr(url)}")

            # Set URL in entry
            self.url_entry.delete(0, 'end')
            self.url_entry.insert(0, url)

            # Validate and auto-start download if valid
            if URLParser.is_valid(url):
                platform, _ = URLParser.parse(url)
                self._show_status(f"✓ Valid {platform.value} URL dropped - starting download...")
                print(f"[SUCCESS] Valid {platform.value} URL dropped - auto-starting download!")

                # Auto-start the download
                self.after(100, self._add_download)  # Small delay to ensure UI updates
            else:
                self._show_status("URL detected - verify before downloading", error=False)
                print(f"[WARNING] Dropped data may not be a valid URL, please verify")

            print(f"[DROP EVENT] ========================================\n")

            # Reset cursor
            self.configure(cursor="")

            return event.action
        except Exception as e:
            print(f"[ERROR] Drop handling failed: {e}")
            import traceback
            traceback.print_exc()
            self._show_status(f"Drop failed: {e}", error=True)
            self.configure(cursor="")  # Reset cursor on error

    def _on_drop_enter(self, event):
        """Handle drag enter event."""
        try:
            print(f"\n[DROP ENTER EVENT] Drag detected over window!")
            print(f"[DEBUG] Event widget: {event.widget}")
            print(f"[DEBUG] Event action: {event.action}")

            # Try to get available data types
            if hasattr(event, 'types'):
                print(f"[DEBUG] Available data types: {event.types}")
            elif hasattr(event, 'type'):
                print(f"[DEBUG] Event type: {event.type}")

            # Try to inspect event data
            if hasattr(event, 'data'):
                print(f"[DEBUG] Event data: {event.data}")

            # Update UI
            self._show_status("Drop URL here...")
            self.configure(cursor="hand2")  # Change cursor to indicate drop is possible

        except Exception as e:
            print(f"[ERROR] Drop enter handler error: {e}")
            import traceback
            traceback.print_exc()

        return event.action

    def _on_drop_leave(self, event):
        """Handle drag leave event."""
        try:
            print(f"[DROP LEAVE EVENT] Drag left window")
            self._show_status("Ready")
            self.configure(cursor="")  # Reset cursor

        except Exception as e:
            print(f"[ERROR] Drop leave handler error: {e}")

        return event.action

    def _on_drop_position(self, event):
        """Handle drag position event (called while dragging over window)."""
        # This fires continuously while dragging - only log once per drag
        if not hasattr(self, '_drag_in_progress'):
            self._drag_in_progress = True
            print(f"[DROP POSITION] Drag moving over window at ({event.x_root}, {event.y_root})")

        return event.action

    def _on_paste(self, event):
        """Handle paste event."""
        try:
            # Schedule the download check after paste completes
            self.after(100, self._check_pasted_url)
        except Exception as e:
            print(f"[ERROR] Paste handling failed: {e}")

    def _check_pasted_url(self):
        """Check if pasted content is a valid URL and auto-start download."""
        url = self.url_entry.get().strip()
        if url and URLParser.is_valid(url):
            print(f"[DEBUG] Valid URL pasted: {url}")
            platform, _ = URLParser.parse(url)
            self._show_status(f"✓ Valid {platform.value} URL pasted - starting download...")

            # Auto-start the download
            self.after(100, self._add_download)

    def _open_settings(self):
        """Open settings window."""
        # TODO: Implement settings window
        self._show_status("Settings coming soon!")

    def _open_downloads_folder(self):
        """Open downloads folder in file manager."""
        import subprocess
        import sys

        folder = config.downloads_path

        try:
            if sys.platform == 'darwin':  # macOS
                subprocess.run(['open', folder])
            elif sys.platform == 'win32':  # Windows
                subprocess.run(['explorer', folder])
            else:  # Linux
                subprocess.run(['xdg-open', folder])
        except Exception as e:
            self._show_status(f"Failed to open folder: {e}", error=True)

    def _on_close(self):
        """Handle window close."""
        self.is_running = False
        self.download_manager.stop_worker()

        # Close PySide6 floating button if it exists
        if hasattr(self, 'floating_button'):
            try:
                self.floating_button.close()
            except:
                pass

        # Close Qt application if it exists
        if hasattr(self, 'qt_app'):
            try:
                self.qt_app.quit()
            except:
                pass

        self.destroy()
