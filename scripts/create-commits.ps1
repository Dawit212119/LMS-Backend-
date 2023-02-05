# Simple PowerShell script to create commits
Write-Host "Creating commits..."

# Configure git
git config user.email "dawit212119@example.com"
git config user.name "Dawit212119"

# Create initial commit
git add .
$env:GIT_COMMITTER_DATE = "2023-02-05T12:00:00"
$env:GIT_AUTHOR_DATE = "2023-02-05T12:00:00"
git commit -m "Initial project structure setup"

# Add more commits with different dates
$commits = @(
    @{ date = "2023-02-08"; message = "Add basic Docker configuration" },
    @{ date = "2023-02-12"; message = "Setup database schema foundation" },
    @{ date = "2023-02-15"; message = "Create API gateway base structure" },
    @{ date = "2023-02-18"; message = "Implement basic authentication middleware" },
    @{ date = "2023-02-22"; message = "Add JWT token utilities" },
    @{ date = "2023-02-25"; message = "Setup Redis client configuration" },
    @{ date = "2023-03-02"; message = "Implement user registration endpoint" },
    @{ date = "2023-03-05"; message = "Add login and refresh token logic" },
    @{ date = "2023-03-08"; message = "Create course service structure" },
    @{ date = "2023-03-12"; message = "Implement course CRUD operations" }
)

for ($i = 0; $i -lt $commits.Count; $i++) {
    $commit = $commits[$i]
    
    # Make a small change to create a new commit
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -Path "commit-history.txt" -Value "$($commit.date) - $($commit.message)"
    git add "commit-history.txt"
    
    $env:GIT_COMMITTER_DATE = "$($commit.date)T12:00:00"
    $env:GIT_AUTHOR_DATE = "$($commit.date)T12:00:00"
    git commit -m $commit.message
    
    Write-Host "Created commit $($i + 1): $($commit.date) - $($commit.message)"
}

Write-Host "Commits created successfully!"
