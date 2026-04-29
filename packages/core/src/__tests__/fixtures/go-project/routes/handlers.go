// Package routes defines HTTP handlers.
package routes

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/go-chi/chi/v5"
)

// SetupGinRoutes configures Gin routes.
func SetupGinRoutes(r *gin.Engine) {
	r.GET("/users", listUsers)
	r.POST("/users", createUser)
	r.DELETE("/users/:id", authMiddleware(), deleteUser)

	api := r.Group("/api")
	api.GET("/health", healthCheck)
}

// SetupChiRoutes configures Chi routes.
func SetupChiRoutes(r chi.Router) {
	r.Get("/items", listItems)
	r.Post("/items", createItem)

	r.Route("/admin", func(r chi.Router) {
		r.Use(authMiddleware)
		r.Get("/dashboard", dashboard)
	})
}

// SetupStdRoutes configures net/http routes.
func SetupStdRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/status", statusHandler)
}

func listUsers(c *gin.Context)    {}
func createUser(c *gin.Context)   {}
func deleteUser(c *gin.Context)   {}
func healthCheck(c *gin.Context)  {}
func listItems(w http.ResponseWriter, r *http.Request)  {}
func createItem(w http.ResponseWriter, r *http.Request) {}
func dashboard(w http.ResponseWriter, r *http.Request)  {}
func statusHandler(w http.ResponseWriter, r *http.Request) {}
func authMiddleware() gin.HandlerFunc { return nil }
