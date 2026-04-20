// Package utils provides utility functions.
package utils

// FormatName formats a full name from parts.
func FormatName(first, last string) string {
	return first + " " + last
}

// ParseIntSafe safely parses a string to int.
func ParseIntSafe(value string) (int, bool) {
	for _, c := range value {
		if c < '0' || c > '9' {
			return 0, false
		}
	}
	if len(value) == 0 {
		return 0, false
	}
	n := 0
	for _, c := range value {
		n = n*10 + int(c-'0')
	}
	return n, true
}

// MaxRetries is the default retry limit.
const MaxRetries = 3

// DefaultTimeout is the default timeout in seconds.
const DefaultTimeout = 30

func internalHelper() {}
