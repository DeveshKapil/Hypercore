#ifndef VMX_H
#define VMX_H

#include <stdint.h>
#include <stdio.h>

int is_vtx_supported();
void enable_vmx();
void launch_guest();

#endif