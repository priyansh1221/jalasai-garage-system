# Ola S1 Pro — VCU Software Debug Reference

## Hardware Identification

| Field | Value |
|-------|-------|
| Board | E2-VCU-R01 |
| Main SoC | Quectel SC600Y-EM (Qualcomm SDM450) |
| CPU | SDM450 |
| HWID | `0x0009a0e100000000` |
| MSM_ID | `0x0009a0e1` |
| OEM_ID | `0x0000` |
| MODEL_ID | `0x0000` |
| PK_HASH | `0xcc3153a80293939b90d02d3bf8b23e0292e452fef662c74998421adad42a380f` |
| Serial | `0x4aa56a95` |
| Sahara Protocol | v2 |
| Antennas | 2x Pulse Electronics LTE (W3907XXXX) |
| OS | Android/Linux (custom Ola build) |
| Power Input | 12V DC via main harness connector |

## Current State

- VCU is in **EDL (Emergency Download) mode**
- USB enumerates as: `Qualcomm CDMA Technologies MSM` / `QUSB__BULK`
- Vendor ID: `0x05c6` (Qualcomm)
- Display shows dim backlight only — no UI, no boot
- ADB does not detect the device
- Diagnosis: **firmware corrupted / wiped** — hardware is alive

## How We Confirmed EDL Mode

```bash
# USB detection on Mac
ioreg -p IOUSB -l -w 0 | grep -A 15 "Qualcomm"
# Output: "kUSBProductString" = "QUSB__BULK"

# EDL tool detection
cd ~/edl && sudo python3 edl.py printgpt
# Output: SDM450 detected, Sahara protocol v2, mode: sahara
```

## Required Files for Recovery

### 1. Firehose Programmer (loader)
- Needed filename pattern: `0009a0e100000000_cc3153a80293939b_FHPRG.bin`
- This is a signed .mbn binary that runs on the SoC to enable eMMC read/write
- Must match both HWID and PK_HASH — secure boot enforced
- **Not found** in bkerler/edl or bkerler/Loaders repos (checked 2026-04-04)

### 2. Firmware Package
- Partition images for the Ola VCU (boot, system, modem, userdata, etc.)
- Format: rawprogram*.xml + patch*.xml + .img/.bin files
- Or individual partition images flashable via EDL firehose

## Tools Setup (Mac)

```bash
# EDL tool (bkerler)
cd ~ && git clone https://github.com/bkerler/edl.git
cd edl && pip3 install -r requirements.txt --user

# Loader collection
cd ~ && git clone https://github.com/bkerler/Loaders.git
cp -rn ~/Loaders/* ~/edl/Loaders/

# USB library
brew install libusb

# ADB (for when device boots normally)
brew install android-platform-tools
```

## EDL Commands Reference

All commands require `sudo` on Mac. Power cycle VCU before each attempt.

```bash
# Read partition table (needs programmer)
sudo python3 edl.py printgpt

# Read partition table with specific loader
sudo python3 edl.py printgpt --loader=path/to/programmer.mbn

# Dump a specific partition
sudo python3 edl.py r boot boot.img

# Flash a specific partition
sudo python3 edl.py w boot boot.img

# Full firmware flash
sudo python3 edl.py qfil rawprogram0.xml patch0.xml path/to/images/

# Reset device
sudo python3 edl.py reset

# Get Sahara info
sudo python3 edl.py sahara -info

# Explicit VID/PID
sudo python3 edl.py printgpt --vid=0x05c6 --pid=0x9008
```

## Diagnostic Commands (Mac)

```bash
# Check USB devices
system_profiler SPUSBDataType

# Check serial ports
ls /dev/tty.* /dev/cu.*

# Raw USB registry
ioreg -p IOUSB -l -w 0 | grep -A 15 "Qualcomm"

# ADB device check
adb devices

# Watch USB events live
log stream --predicate 'subsystem == "com.apple.iokit.IOUSBHost"' --info
```

## Where to Source Programmer / Firmware

| Source | What to Search |
|--------|---------------|
| XDA Developers | "Ola S1 VCU firmware" or "SDM450 EDL programmer 0009a0e1" |
| Quectel Forums | "SC600Y prog_emmc_firehose.mbn" |
| Telegram | Ola S1 hacking / repair groups |
| Ola Service Center | Ask for EDL reflash — they have QPST/QFlash + firmware |
| Hovatek | Qualcomm programmer collection |

## Connection Notes

- USB alone cannot power the VCU — needs 12V via harness connector
- Mac may block unknown USB accessories — check System Settings > Privacy & Security
- EDL session times out quickly — run commands immediately after power-on
- Sahara handshake errors require full power cycle before retry
- `QUSB__BULK` = EDL mode confirmed
- If ADB shows device = Android is partially booting (different recovery path)

## Possible Root Causes

- Failed OTA update (most common on Ola S1)
- Corrupted eMMC boot partition
- Power loss during firmware write
- eMMC hardware failure (less likely — EDL mode works)

## Next Steps

1. Source the correct firehose programmer for SDM450 + PK_HASH `cc3153a8...`
2. Once programmer obtained: `sudo python3 edl.py printgpt --loader=programmer.mbn`
3. If partition table reads successfully, dump all partitions as backup
4. Flash stock Ola firmware
5. Alternative: take to Ola service center with this diagnostic info
