# LAB-Guard Migration Guide

## Migration to Dynamic User Management

LAB-Guard has been updated to remove hardcoded test accounts and implement fully dynamic user management. This guide will help you migrate from the previous version.

## What Changed

### Before (Previous Version)
- ✗ Hardcoded test accounts (teacher1, student1, etc.)
- ✗ Pre-seeded test exams
- ✗ Static test data in codebase

### After (Current Version)
- ✅ Dynamic user management through Admin Panel
- ✅ Clean database initialization
- ✅ Setup wizard for first-time users
- ✅ No hardcoded test data

## Migration Steps

### Step 1: Backup Your Data (Optional)
If you have important data from the previous version:
```bash
# Backup your existing database
cp data/database.sqlite data/database.sqlite.backup
```

### Step 2: Clean Up Test Data
Run the cleanup script to remove test accounts and start fresh:
```bash
npm run cleanup-db
```

### Step 3: Start the Application
```bash
npm run dev
```

### Step 4: Initial Setup
1. **Setup Wizard**: On first launch, you'll see a setup wizard
2. **Admin Login**: Use the default admin account:
   - Username: `admin`
   - Password: `admin123`
3. **Change Password**: Immediately change the default admin password
4. **Create Users**: Use the Admin Panel to create teacher and student accounts

## Admin Panel Features

### User Management
- **Create Individual Users**: Add teachers and students one by one
- **Bulk Import**: Upload CSV files to create multiple users at once
- **User Roles**: Assign appropriate roles (teacher/student)
- **Face Registration**: Monitor biometric registration status

### CSV Import Format
For bulk user creation, use this CSV format:
```csv
username,password,role,fullName,email
john.doe,password123,teacher,John Doe,john.doe@university.edu
jane.smith,password123,student,Jane Smith,jane.smith@student.edu
```

### System Settings
- **Face Recognition Threshold**: Adjust biometric sensitivity
- **Session Timeout**: Configure login session duration
- **Security Settings**: Manage authentication parameters

## Security Improvements

### Default Admin Account
- **Purpose**: Bootstrap system initialization only
- **Security**: Change default password immediately
- **Best Practice**: Create additional admin accounts and disable default if needed

### Dynamic Authentication
- **No Hardcoded Credentials**: All accounts created through secure admin interface
- **Audit Trail**: All user creation/modification logged
- **Role-Based Access**: Proper permission management

## Troubleshooting

### Issue: Can't Login with Old Test Accounts
**Solution**: Test accounts have been removed. Use admin account to create new users.

### Issue: No Exams Available
**Solution**: Previous test exams were removed. Teachers need to create new exams.

### Issue: Face Recognition Not Working
**Solution**: Face embeddings were cleared. Students need to re-register their faces.

### Issue: Setup Wizard Keeps Appearing
**Solution**: Create at least one teacher or student account through Admin Panel.

## Best Practices

### User Account Management
1. **Naming Convention**: Use consistent username formats (e.g., firstname.lastname)
2. **Strong Passwords**: Enforce password complexity requirements
3. **Regular Cleanup**: Remove inactive accounts periodically
4. **Role Assignment**: Assign minimal required permissions

### System Administration
1. **Regular Backups**: Backup database before major changes
2. **Audit Monitoring**: Review audit logs regularly
3. **Security Updates**: Keep admin passwords secure and updated
4. **User Training**: Train teachers and students on new login process

## Support

If you encounter issues during migration:

1. **Check Logs**: Review console output for error messages
2. **Database Issues**: Use `npm run cleanup-db` to reset to clean state
3. **Permission Problems**: Ensure admin account has proper privileges
4. **Face Recognition**: Clear browser cache and re-register faces

## Rollback (If Needed)

If you need to rollback to the previous version:

1. **Restore Backup**: Replace database with backup file
2. **Previous Version**: Checkout previous git commit
3. **Dependencies**: Run `npm install` to restore previous packages

```bash
# Restore database backup
cp data/database.sqlite.backup data/database.sqlite

# Checkout previous version (replace with actual commit hash)
git checkout <previous-commit-hash>

# Reinstall dependencies
npm install
```

## Summary

The migration to dynamic user management provides:
- **Enhanced Security**: No hardcoded credentials
- **Better Scalability**: Easy user management for large institutions
- **Improved Audit**: Complete tracking of user activities
- **Professional Setup**: Clean, production-ready initialization

This change makes LAB-Guard more suitable for production deployment while maintaining all existing functionality.