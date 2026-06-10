# Changelog

## v2.4.2 (Latest)

### 🚀 Major Architectural Upgrades

* **3-Layer Sync Probe System (Frontend / Kernel / Backend):** Refactored the core network diagnostic pipeline to provide granular tracing across the three major layers. You can now reliably monitor specific synchronization steps and precisely pinpoint failures.
* **Kernel State Machine & Request Queue:** Re-architected the Rust `core-backend` to process all synchronization protocols (FTP, LWW, WebDAV) securely via a central `KernelRequest` dispatcher `queue`.
* **Unified Dual-Channel Log System (`LogBus`):** Event logs now dual-write sequentially to an independent SQL (`sync_probe`) table for long-term durable trace history, while simultaneously broadcasting via SSE to the Frontend interface. Replaced fragmented log outputs and eliminated "lost logs" issues.
* **Driver Standardizations:** FTP and LWW synchronization mechanics are now fully integrated as uniform Kernel Drivers (`ftp_driver`, `lww_driver`), sharing exact trace semantics.

### 🐛 Bug Fixes & Resiliency

* **Fixed Proxy Parsing Faults:** Completely eliminated the infamous JSON parsing bug (`Unexpected token < in JSON at position 0`) normally caused by backend crash fallback to HTML.
* **Network & I/O Blockage Recovery:** Added an intelligent 3-second Frontend watchdog that auto-halts and identifies if the bottom-layer Rust Kernel or driver encounters an infinite block.
* **FTP Cold-Start Resolution:** Corrected instances where FTP verification succeeded but logged as failed due to unmounted network caches routing concurrently with local state changes.
