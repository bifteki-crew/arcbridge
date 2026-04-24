// Package models contains domain types.
package models

// UserRole represents the role of a user.
type UserRole string

const (
	// RoleAdmin is the administrator role.
	RoleAdmin UserRole = "admin"
	// RoleUser is the standard user role.
	RoleUser UserRole = "user"
	// RoleGuest is the guest role.
	RoleGuest UserRole = "guest"
)

// User represents a user in the system.
type User struct {
	ID    int
	Name  string
	Email string
	Role  UserRole
}

// DisplayName returns the formatted display name.
func (u *User) DisplayName() string {
	return u.Name + " (" + string(u.Role) + ")"
}

// IsAdmin checks whether the user has admin role.
func (u *User) IsAdmin() bool {
	return u.Role == RoleAdmin
}

// UserStore defines the interface for user persistence.
type UserStore interface {
	FindByID(id int) (*User, error)
	FindByEmail(email string) (*User, error)
	Save(user *User) error
}

// MaxUsers is the maximum number of allowed users.
var MaxUsers = 1000

// internalCounter is unexported.
var internalCounter int
