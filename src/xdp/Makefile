CLANG := clang
LLC := llc
ARCH := x86

# Kernel headers path
KERNEL_HEADERS := /lib/modules/$(shell uname -r)/build

# Source files
XDP_SRC := cloudnord_xdp.c
XDP_OBJ := cloudnord_xdp.o

# Compilation flags
CFLAGS := -O2 -g -Wall -Wextra
CLANG_FLAGS := -I$(KERNEL_HEADERS)/arch/$(ARCH)/include \
               -I$(KERNEL_HEADERS)/arch/$(ARCH)/include/generated \
               -I$(KERNEL_HEADERS)/include \
               -I$(KERNEL_HEADERS)/arch/$(ARCH)/include/uapi \
               -I$(KERNEL_HEADERS)/arch/$(ARCH)/include/generated/uapi \
               -I$(KERNEL_HEADERS)/include/uapi \
               -I$(KERNEL_HEADERS)/include/generated/uapi \
               -I$(KERNEL_HEADERS)/include \
               -I$(KERNEL_HEADERS)/arch/$(ARCH)/include \
               -I$(KERNEL_HEADERS)/arch/$(ARCH)/include \
               -I$(KERNEL_HEADERS)/arch/$(ARCH)/include/generated \
               -I$(KERNEL_HEADERS)/include \
               -I$(KERNEL_HEADERS)/arch/$(ARCH)/include/uapi \
               -I$(KERNEL_HEADERS)/arch/$(ARCH)/include/generated/uapi \
               -I$(KERNEL_HEADERS)/include/uapi \
               -I$(KERNEL_HEADERS)/include/generated/uapi \
               -include $(KERNEL_HEADERS)/include/linux/kconfig.h \
               -D__KERNEL__ -D__BPF_TRACING__ \
               -Wno-unused-value -Wno-pointer-sign \
               -Wno-compare-distinct-pointer-types \
               -Wno-gnu-variable-sized-type-not-at-end \
               -Wno-address-of-packed-member -Wno-tautological-compare \
               -Wno-unknown-warning-option

# Default target
all: $(XDP_OBJ)

# Compile XDP program
$(XDP_OBJ): $(XDP_SRC)
	$(CLANG) $(CLANG_FLAGS) -c $< -o $@

# Clean build artifacts
clean:
	rm -f $(XDP_OBJ)

# Install XDP program
install: $(XDP_OBJ)
	sudo ip link set dev eth0 xdp obj $(XDP_OBJ) sec xdp

# Uninstall XDP program
uninstall:
	sudo ip link set dev eth0 xdp off

# Show XDP program info
show:
	sudo ip link show dev eth0

.PHONY: all clean install uninstall show
