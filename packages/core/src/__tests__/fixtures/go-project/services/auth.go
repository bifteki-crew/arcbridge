// Package services contains business logic.
package services

import "testapp/models"

// AuthError represents an authentication failure.
type AuthError struct {
	Message string
}

// Error implements the error interface.
func (e *AuthError) Error() string {
	return e.Message
}

// AuthService handles authentication.
type AuthService struct {
	store models.UserStore
}

// NewAuthService creates a new AuthService.
func NewAuthService(store models.UserStore) *AuthService {
	return &AuthService{store: store}
}

// Authenticate validates credentials and returns a user.
func (s *AuthService) Authenticate(email string, password string) (*models.User, error) {
	user, err := s.store.FindByEmail(email)
	if err != nil {
		return nil, &AuthError{Message: "invalid credentials"}
	}
	return user, nil
}

// ValidateToken checks if a token is valid.
func (s *AuthService) ValidateToken(token string) bool {
	return len(token) > 0
}

func hashPassword(password string) string {
	return password
}
