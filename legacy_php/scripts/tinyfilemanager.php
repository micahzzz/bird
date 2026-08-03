<?php
// PHP 8.0
//
//
// ############################################################################
// #                                                                          #
// #  ████████╗██╗███╗   ██╗██╗   ██╗███████╗███████╗██████╗ ██╗      ██████╗  #
// #  ╚══██╔══╝██║████╗  ██║██║   ██║██╔════╝██╔════╝██╔══██╗██║     ██╔═══██╗ #
// #     ██║   ██║██╔██╗ ██║██║   ██║█████╗  █████╗  ██████╔╝██║     ██║   ██║ #
// #     ██║   ██║██║╚██╗██║██║   ██║██╔══╝  ██╔══╝  ██╔══██╗██║     ██║   ██║ #
// #     ██║   ██║██║ ╚████║╚██████╔╝███████╗███████╗██║  ██║███████╗╚██████╔╝ #
// #     ╚═╝   ╚═╝╚═╝  ╚═══╝ ╚═════╝ ╚══════╝╚══════╝╚═╝  ╚═╝╚══════╝ ╚═════╝  #
// #                                                                          #
// #                        [ https://tinyfilemanager.github.io ]             #
// #                                                                          #
// # ######################################################################## #
// #                                                                          #
// #   This is a tiny file manager with single php file. It is a web based    #
// #   file manager and it can be used to manage your files and folders.      #
// #                                                                          #
// #   You can use it to upload, download, edit, delete, copy, paste, zip,    #
// #   unzip, and search for files and folders.                               #
// #                                                                          #
_ ########################################################################## #

// ############# Configuration #############

// ############# Auth #############
// Set authentication method
// By default, the authentication method is 'none', which means no authentication is required.
// You can set it to 'basic' to enable basic authentication.
// If you set it to 'basic', you must also set the username and password in the $auth_users array.
$auth_method = 'none';

// Set username and password for basic authentication
// You can add multiple users to this array
// For example:
// $auth_users = [
//     'user1' => 'pass1',
//     'user2' => 'pass2',
// ];
$auth_users = [
    'admin' => 'admin@123',
    'user' => 'user@123'
];

// ############# Session #############
// Set session name
// By default, the session name is 'tinyfilemanager'.
// You can change it to something else if you want.
$session_name = 'tinyfilemanager';

// ############# Root Path #############
// Set root path
// By default, the root path is the directory where this script is located.
// You can set it to a different directory if you want.
// For example:
// $root_path = '/home/user/public_html';
$root_path = $_SERVER['DOCUMENT_ROOT'];

// Set root url
// By default, the root url is empty.
// If you are using this file manager in a subdirectory, you should set this to the subdirectory name.
// For example:
// $root_url = '/tinyfilemanager';
$root_url = '';

// ############# Allowed Actions #############
// Set allowed actions
// By default, all actions are allowed.
// You can disable some actions by setting them to false.
// For example:
// 'upload' => false,
$allowed_actions = [
    'upload' => true,
    'download' => true,
    'edit' => true,
    'delete' => true,
    'copy' => true,
    'paste' => true,
    'zip' => true,
    'unzip' => true,
    'search' => true,
    'create_folder' => true,
    'create_file' => true,
    'rename' => true,
    'chmod' => true,
    'view' => true,
];

// ############# Allowed Upload Extensions #############
// Set allowed upload extensions
// By default, all extensions are allowed.
// You can restrict the allowed extensions by setting this to an array of extensions.
// For example:
// $allowed_upload_extensions = ['jpg', 'jpeg', 'png', 'gif'];
$allowed_upload_extensions = [];

// ############# Disabled Functions #############
// Set disabled functions
// By default, no functions are disabled.
// You can disable some functions by setting this to an array of function names.
// For example:
// $disabled_functions = ['phpinfo'];
$disabled_functions = [];

// ############# Max Upload Size #############
// Set max upload size
// By default, the max upload size is the value of upload_max_filesize in php.ini.
// You can set it to a different value if you want.
// The value must be in bytes.
// For example:
// 2 * 1024 * 1024 = 2MB
$max_upload_size = 0;

// ############# Max Execution Time #############
// Set max execution time
// By default, the max execution time is the value of max_execution_time in php.ini.
// You can set it to a different value if you want.
// The value must be in seconds.
$max_execution_time = 0;

// ############# Default Timezone #############
// Set default timezone
// By default, the timezone is the value of date.timezone in php.ini.
// You can set it to a different value if you want.
// For example:
// date_default_timezone_set('Asia/Kolkata');
date_default_timezone_set(@date_default_timezone_get());

// ############# Default Language #############
// Set default language
// By default, the language is English.
// You can change it to a different language by setting this to the language code.
// For example:
// $default_language = 'fr';
$default_language = 'en';

// ############# Theme #############
// Set theme
// By default, the theme is 'light'.
// You can change it to 'dark' if you want.
$theme = 'dark';

// ############# Development #############
// Set development mode
// By default, development mode is disabled.
// If you enable it, all errors will be displayed.
$development_mode = false;

// ############# Other #############
// Set default file and folder permissions
// By default, the permissions are 0755 for folders and 0644 for files.
$default_folder_permissions = 0755;
$default_file_permissions = 0644;

// Set default file and folder owner and group
// By default, the owner and group are the same as the user running this script.
$default_owner = null;
$default_group = null;

// ############# End of Configuration #############

// ############# Do not edit below this line #############

// ############# Init #############
if ($development_mode) {
    error_reporting(E_ALL);
    ini_set('display_errors', 1);
} else {
    error_reporting(0);
    ini_set('display_errors', 0);
}

if ($max_upload_size > 0) {
    ini_set('upload_max_filesize', $max_upload_size);
    ini_set('post_max_size', $max_upload_size);
}

if ($max_execution_time > 0) {
    ini_set('max_execution_time', $max_execution_time);
}

if ($auth_method === 'basic') {
    if (!isset($_SERVER['PHP_AUTH_USER']) || !isset($_SERVER['PHP_AUTH_PW']) || !isset($auth_users[$_SERVER['PHP_AUTH_USER']]) || $auth_users[$_SERVER['PHP_AUTH_USER']] !== $_SERVER['PHP_AUTH_PW']) {
        header('WWW-Authenticate: Basic realm="Tiny File Manager"');
        header('HTTP/1.0 401 Unauthorized');
        exit;
    }
}

if ($session_name) {
    session_name($session_name);
}

session_start();

if ($root_path) {
    if (is_dir($root_path)) {
        chdir($root_path);
    }
}

$root_path = getcwd();

if ($root_url) {
    $root_url = rtrim($root_url, '/');
}

if ($allowed_actions) {
    foreach ($allowed_actions as $action => $allowed) {
        if (!$allowed) {
            $disabled_functions[] = $action;
        }
    }
}

if ($allowed_upload_extensions) {
    $allowed_upload_extensions = array_map('strtolower', $allowed_upload_extensions);
}

if ($disabled_functions) {
    foreach ($disabled_functions as $function) {
        if (function_exists($function)) {
            $disabled_functions[] = $function;
        }
    }
}

// ############# Language #############
$languages = [
    'en' => [
        'title' => 'Tiny File Manager',
        'upload' => 'Upload',
        'download' => 'Download',
        'edit' => 'Edit',
        'delete' => 'Delete',
        'copy' => 'Copy',
        'paste' => 'Paste',
        'zip' => 'Zip',
        'unzip' => 'Unzip',
        'search' => 'Search',
        'create_folder' => 'Create Folder',
        'create_file' => 'Create File',
        'rename' => 'Rename',
        'chmod' => 'Chmod',
        'view' => 'View',
        'name' => 'Name',
        'size' => 'Size',
        'date' => 'Date',
        'actions' => 'Actions',
        'file' => 'File',
        'folder' => 'Folder',
        'path' => 'Path',
        'home' => 'Home',
        'parent' => 'Parent',
        'refresh' => 'Refresh',
        'logout' => 'Logout',
        'login' => 'Login',
        'username' => 'Username',
        'password' => 'Password',
        'go' => 'Go',
        'cancel' => 'Cancel',
        'submit' => 'Submit',
        'close' => 'Close',
        'save' => 'Save',
        'yes' => 'Yes',
        'no' => 'No',
        'error' => 'Error',
        'success' => 'Success',
        'warning' => 'Warning',
        'info' => 'Info',
        'confirm' => 'Confirm',
        'are_you_sure' => 'Are you sure?',
        'file_not_found' => 'File not found.',
        'folder_not_found' => 'Folder not found.',
        'file_exists' => 'File exists.',
        'folder_exists' => 'Folder exists.',
        'invalid_name' => 'Invalid name.',
        'invalid_path' => 'Invalid path.',
        'invalid_file' => 'Invalid file.',
        'invalid_folder' => 'Invalid folder.',
        'permission_denied' => 'Permission denied.',
        'upload_failed' => 'Upload failed.',
        'upload_success' => 'Upload success.',
        'upload_limit_exceeded' => 'Upload limit exceeded.',
        'upload_invalid_extension' => 'Upload invalid extension.',
        'download_failed' => 'Download failed.',
        'download_success' => 'Download success.',
        'edit_failed' => 'Edit failed.',
        'edit_success' => 'Edit success.',
        'delete_failed' => 'Delete failed.',
        'delete_success' => 'Delete success.',
        'copy_failed' => 'Copy failed.',
        'copy_success' => 'Copy success.',
        'paste_failed' => 'Paste failed.',
        'paste_success' => 'Paste success.',
        'zip_failed' => 'Zip failed.',
        'zip_success' => 'Zip success.',
        'unzip_failed' => 'Unzip failed.',
        'unzip_success' => 'Unzip success.',
        'search_failed' => 'Search failed.',
        'search_success' => 'Search success.',
        'create_folder_failed' => 'Create folder failed.',
        'create_folder_success' => 'Create folder success.',
        'create_file_failed' => 'Create file failed.',
        'create_file_success' => 'Create file success.',
        'rename_failed' => 'Rename failed.',
        'rename_success' => 'Rename success.',
        'chmod_failed' => 'Chmod failed.',
        'chmod_success' => 'Chmod success.',
        'view_failed' => 'View failed.',
        'view_success' => 'View success.',
    ],
    'fr' => [
        'title' => 'Gestionnaire de fichiers',
        'upload' => 'Télécharger',
        'download' => 'Télécharger',
        'edit' => 'Éditer',
        'delete' => 'Supprimer',
        'copy' => 'Copier',
        'paste' => 'Coller',
        'zip' => 'Zippé',
        'unzip' => 'Dézipper',
        'search' => 'Rechercher',
        'create_folder' => 'Créer un dossier',
        'create_file' => 'Créer un fichier',
        'rename' => 'Renommer',
        'chmod' => 'Chmod',
        'view' => 'Voir',
        'name' => 'Nom',
        'size' => 'Taille',
        'date' => 'Date',
        'actions' => 'Actions',
        'file' => 'Fichier',
        'folder' => 'Dossier',
        'path' => 'Chemin',
        'home' => 'Accueil',
        'parent' => 'Parent',
        'refresh' => 'Actualiser',
        'logout' => 'Déconnexion',
        'login' => 'Connexion',
        'username' => 'Nom d'utilisateur',
        'password' => 'Mot de passe',
        'go' => 'Aller',
        'cancel' => 'Annuler',
        'submit' => 'Soumettre',
        'close' => 'Fermer',
        'save' => 'Enregistrer',
        'yes' => 'Oui',
        'no' => 'Non',
        'error' => 'Erreur',
        'success' => 'Succès',
        'warning' => 'Avertissement',
        'info' => 'Info',
        'confirm' => 'Confirmer',
        'are_you_sure' => 'Êtes-vous sûr?',
        'file_not_found' => 'Fichier non trouvé.',
        'folder_not_found' => 'Dossier non trouvé.',
        'file_exists' => 'Le fichier existe.',
        'folder_exists' => 'Le dossier existe.',
        'invalid_name' => 'Nom invalide.',
        'invalid_path' => 'Chemin invalide.',
        'invalid_file' => 'Fichier invalide.',
        'invalid_folder' => 'Dossier invalide.',
        'permission_denied' => 'Permission refusée.',
        'upload_failed' => 'Échec du téléchargement.',
        'upload_success' => 'Téléchargement réussi.',
        'upload_limit_exceeded' => 'Limite de téléchargement dépassée.',
        'upload_invalid_extension' => 'Extension de téléchargement invalide.',
        'download_failed' => 'Échec du téléchargement.',
        'download_success' => 'Téléchargement réussi.',
        'edit_failed' => 'Échec de la modification.',
        'edit_success' => 'Modification réussie.',
        'delete_failed' => 'Échec de la suppression.',
        'delete_success' => 'Suppression réussie.',
        'copy_failed' => 'Échec de la copie.',
        'copy_success' => 'Copie réussie.',
        'paste_failed' => 'Échec du collage.',
        'paste_success' => 'Collage réussi.',
        'zip_failed' => 'Échec du zip.',
        'zip_success' => 'Zip réussi.',
        'unzip_failed' => 'Échec du dézip.',
        'unzip_success' => 'Dézip réussi.',
        'search_failed' => 'Échec de la recherche.',
        'search_success' => 'Recherche réussie.',
        'create_folder_failed' => 'Échec de la création du dossier.',
        'create_folder_success' => 'Création du dossier réussie.',
        'create_file_failed' => 'Échec de la création du fichier.',
        'create_file_success' => 'Création du fichier réussie.',
        'rename_failed' => 'Échec du renommage.',
        'rename_success' => 'Renommage réussi.',
        'chmod_failed' => 'Échec du chmod.',
        'chmod_success' => 'Chmod réussi.',
        'view_failed' => 'Échec de la vue.',
        'view_success' => 'Vue réussie.',
    ],
];

if (isset($_GET['lang']) && isset($languages[$_GET['lang']])) {
    $language = $_GET['lang'];
    $_SESSION['language'] = $language;
} elseif (isset($_SESSION['language']) && isset($languages[$_SESSION['language']])) {
    $language = $_SESSION['language'];
} else {
    $language = $default_language;
}

$lang = $languages[$language];

// ############# Functions #############
function get_url($path)
{
    global $root_url;
    $url = $root_url . '/' . ltrim(str_replace(getcwd(), '', $path), '/');
    return str_replace('', '/', $url);
}

function get_path($url)
{
    global $root_url;
    $path = str_replace($root_url, '', $url);
    $path = getcwd() . '/' . ltrim($path, '/');
    return str_replace('', '/', $path);
}

function get_size($size)
{
    if ($size < 1024) {
        return $size . ' B';
    } elseif ($size < 1048576) {
        return round($size / 1024, 2) . ' KB';
    } elseif ($size < 1073741824) {
        return round($size / 1048576, 2) . ' MB';
    } else {
        return round($size / 1073741824, 2) . ' GB';
    }
}

function get_date($date)
{
    return date('Y-m-d H:i:s', $date);
}

function get_permissions($permissions)
{
    $info = '';
    // Owner
    $info .= (($permissions & 0x0100) ? 'r' : '-');
    $info .= (($permissions & 0x0080) ? 'w' : '-');
    $info .= (($permissions & 0x0040) ?
        (($permissions & 0x0800) ? 's' : 'x') :
        (($permissions & 0x0800) ? 'S' : '-'));

    // Group
    $info .= (($permissions & 0x0020) ? 'r' : '-');
    $info .= (($permissions & 0x0010) ? 'w' : '-');
    $info .= (($permissions & 0x0008) ?
        (($permissions & 0x0400) ? 's' : 'x') :
        (($permissions & 0x0400) ? 'S' : '-'));

    // World
    $info .= (($permissions & 0x0004) ? 'r' : '-');
    $info .= (($permissions & 0x0002) ? 'w' : '-');
    $info .= (($permissions & 0x0001) ?
        (($permissions & 0x0200) ? 't' : 'x') :
        (($permissions & 0x0200) ? 'T' : '-'));
    return $info;
}

function get_icon($file)
{
    $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
    switch ($ext) {
        case 'php':
            return 'php';
        case 'html':
        case 'htm':
            return 'html';
        case 'css':
            return 'css';
        case 'js':
            return 'js';
        case 'json':
            return 'json';
        case 'md':
            return 'markdown';
        case 'txt':
            return 'text';
        case 'log':
            return 'log';
        case 'xml':
            return 'xml';
        case 'sql':
            return 'sql';
        case 'zip':
        case 'rar':
        case '7z':
        case 'gz':
        case 'tar':
            return 'zip';
        case 'jpg':
        case 'jpeg':
        case 'png':
        case 'gif':
        case 'bmp':
        case 'svg':
        case 'ico':
            return 'image';
        case 'mp3':
        case 'wav':
        case 'ogg':
        case 'flac':
        case 'm4a':
            return 'audio';
        case 'mp4':
        case 'mkv':
        case 'avi':
        case 'mov':
        case 'wmv':
            return 'video';
        case 'pdf':
            return 'pdf';
        case 'doc':
        case 'docx':
            return 'word';
        case 'xls':
        case 'xlsx':
            return 'excel';
        case 'ppt':
        case 'pptx':
            return 'powerpoint';
        case 'exe':
        case 'msi':
            return 'exe';
        default:
            return 'file';
    }
}

function get_files($path)
{
    $files = [];
    $folders = [];
    if (is_dir($path)) {
        $items = scandir($path);
        foreach ($items as $item) {
            if ($item === '.' || $item === '..') {
                continue;
            }
            $item_path = $path . '/' . $item;
            if (is_dir($item_path)) {
                $folders[] = [
                    'name' => $item,
                    'path' => $item_path,
                    'size' => '',
                    'date' => get_date(filemtime($item_path)),
                    'permissions' => get_permissions(fileperms($item_path)),
                    'icon' => 'folder',
                    'is_dir' => true,
                ];
            } else {
                $files[] = [
                    'name' => $item,
                    'path' => $item_path,
                    'size' => get_size(filesize($item_path)),
                    'date' => get_date(filemtime($item_path)),
                    'permissions' => get_permissions(fileperms($item_path)),
                    'icon' => get_icon($item),
                    'is_dir' => false,
                ];
            }
        }
    }
    return array_merge($folders, $files);
}

function get_breadcrumbs($path)
{
    global $root_path;
    $breadcrumbs = [];
    $path = str_replace($root_path, '', $path);
    $parts = explode('/', $path);
    $current_path = $root_path;
    foreach ($parts as $part) {
        if ($part === '') {
            continue;
        }
        $current_path .= '/' . $part;
        $breadcrumbs[] = [
            'name' => $part,
            'path' => $current_path,
        ];
    }
    return $breadcrumbs;
}

function get_file_content($file)
{
    if (is_file($file)) {
        return file_get_contents($file);
    }
    return '';
}

function save_file_content($file, $content)
{
    if (is_file($file)) {
        return file_put_contents($file, $content);
    }
    return false;
}

function create_folder($path, $name)
{
    if (is_dir($path)) {
        return mkdir($path . '/' . $name, $GLOBALS['default_folder_permissions'], true);
    }
    return false;
}

function create_file($path, $name)
{
    if (is_dir($path)) {
        return file_put_contents($path . '/' . $name, '', $GLOBALS['default_file_permissions']);
    }
    return false;
}

function rename_item($old, $new)
{
    if (file_exists($old)) {
        return rename($old, $new);
    }
    return false;
}

function delete_item($path)
{
    if (is_dir($path)) {
        $files = array_diff(scandir($path), ['.', '..']);
        foreach ($files as $file) {
            delete_item($path . '/' . $file);
        }
        return rmdir($path);
    } elseif (is_file($path)) {
        return unlink($path);
    }
    return false;
}

function copy_item($source, $destination)
{
    if (is_dir($source)) {
        $dir = opendir($source);
        @mkdir($destination, $GLOBALS['default_folder_permissions'], true);
        while (($file = readdir($dir)) !== false) {
            if ($file !== '.' && $file !== '..') {
                copy_item($source . '/' . $file, $destination . '/' . $file);
            }
        }
        closedir($dir);
    } elseif (is_file($source)) {
        return copy($source, $destination);
    }
    return false;
}

function zip_item($source, $destination)
{
    if (!extension_loaded('zip') || !file_exists($source)) {
        return false;
    }
    $zip = new ZipArchive();
    if (!$zip->open($destination, ZIPARCHIVE::CREATE)) {
        return false;
    }
    $source = str_replace('', '/', realpath($source));
    if (is_dir($source)) {
        $files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($source), RecursiveIteratorIterator::SELF_FIRST);
        foreach ($files as $file) {
            $file = str_replace('', '/', $file);
            if (in_array(substr($file, strrpos($file, '/') + 1), ['.', '..'])) {
                continue;
            }
            $file = realpath($file);
            if (is_dir($file)) {
                $zip->addEmptyDir(str_replace($source . '/', '', $file . '/'));
            } elseif (is_file($file)) {
                $zip->addFromString(str_replace($source . '/', '', $file), file_get_contents($file));
            }
        }
    } elseif (is_file($source)) {
        $zip->addFromString(basename($source), file_get_contents($source));
    }
    return $zip->close();
}

function unzip_item($source, $destination)
{
    if (!extension_loaded('zip') || !file_exists($source)) {
        return false;
    }
    $zip = new ZipArchive();
    if (!$zip->open($source)) {
        return false;
    }
    $zip->extractTo($destination);
    return $zip->close();
}

function search_item($path, $query)
{
    $results = [];
    if (is_dir($path)) {
        $files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($path), RecursiveIteratorIterator::SELF_FIRST);
        foreach ($files as $file) {
            if (in_array(substr($file, strrpos($file, '/') + 1), ['.', '..'])) {
                continue;
            }
            if (strpos(strtolower($file->getFilename()), strtolower($query)) !== false) {
                $results[] = [
                    'name' => $file->getFilename(),
                    'path' => $file->getPathname(),
                    'size' => get_size($file->getSize()),
                    'date' => get_date($file->getMTime()),
                    'permissions' => get_permissions($file->getPerms()),
                    'icon' => get_icon($file->getFilename()),
                    'is_dir' => $file->isDir(),
                ];
            }
        }
    }
    return $results;
}

function chmod_item($path, $permissions)
{
    if (file_exists($path)) {
        return chmod($path, $permissions);
    }
    return false;
}

// ############# End of Functions #############

// ############# Actions #############
if (isset($_GET['action'])) {
    $action = $_GET['action'];
    if (in_array($action, $disabled_functions)) {
        echo json_encode(['error' => $lang['permission_denied']]);
        exit;
    }
    switch ($action) {
        case 'upload':
            if (isset($_FILES['files'])) {
                $files = $_FILES['files'];
                $path = $_POST['path'];
                $errors = [];
                $success = [];
                foreach ($files['name'] as $key => $name) {
                    if ($files['error'][$key] === 0) {
                        $tmp_name = $files['tmp_name'][$key];
                        $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
                        if ($allowed_upload_extensions && !in_array($ext, $allowed_upload_extensions)) {
                            $errors[] = $name . ': ' . $lang['upload_invalid_extension'];
                        } else {
                            if (move_uploaded_file($tmp_name, $path . '/' . $name)) {
                                $success[] = $name;
                            } else {
                                $errors[] = $name . ': ' . $lang['upload_failed'];
                            }
                        }
                    } else {
                        $errors[] = $name . ': ' . $lang['upload_failed'];
                    }
                }
                if (count($errors) > 0) {
                    echo json_encode(['error' => implode(', ', $errors)]);
                } else {
                    echo json_encode(['success' => implode(', ', $success)]);
                }
            }
            break;
        case 'download':
            if (isset($_GET['path'])) {
                $path = $_GET['path'];
                if (is_file($path)) {
                    header('Content-Description: File Transfer');
                    header('Content-Type: application/octet-stream');
                    header('Content-Disposition: attachment; filename="' . basename($path) . '"');
                    header('Expires: 0');
                    header('Cache-Control: must-revalidate');
                    header('Pragma: public');
                    header('Content-Length: ' . filesize($path));
                    readfile($path);
                    exit;
                }
            }
            break;
        case 'edit':
            if (isset($_POST['path']) && isset($_POST['content'])) {
                $path = $_POST['path'];
                $content = $_POST['content'];
                if (save_file_content($path, $content)) {
                    echo json_encode(['success' => $lang['edit_success']]);
                } else {
                    echo json_encode(['error' => $lang['edit_failed']]);
                }
            }
            break;
        case 'delete':
            if (isset($_POST['path'])) {
                $path = $_POST['path'];
                if (delete_item($path)) {
                    echo json_encode(['success' => $lang['delete_success']]);
                } else {
                    echo json_encode(['error' => $lang['delete_failed']]);
                }
            }
            break;
        case 'copy':
            if (isset($_POST['source']) && isset($_POST['destination'])) {
                $source = $_POST['source'];
                $destination = $_POST['destination'];
                if (copy_item($source, $destination)) {
                    echo json_encode(['success' => $lang['copy_success']]);
                } else {
                    echo json_encode(['error' => $lang['copy_failed']]);
                }
            }
            break;
        case 'paste':
            if (isset($_POST['source']) && isset($_POST['destination'])) {
                $source = $_POST['source'];
                $destination = $_POST['destination'];
                if (rename_item($source, $destination)) {
                    echo json_encode(['success' => $lang['paste_success']]);
                } else {
                    echo json_encode(['error' => $lang['paste_failed']]);
                }
            }
            break;
        case 'zip':
            if (isset($_POST['source']) && isset($_POST['destination'])) {
                $source = $_POST['source'];
                $destination = $_POST['destination'];
                if (zip_item($source, $destination)) {
                    echo json_encode(['success' => $lang['zip_success']]);
                } else {
                    echo json_encode(['error' => $lang['zip_failed']]);
                }
            }
            break;
        case 'unzip':
            if (isset($_POST['source']) && isset($_POST['destination'])) {
                $source = $_POST['source'];
                $destination = $_POST['destination'];
                if (unzip_item($source, $destination)) {
                    echo json_encode(['success' => $lang['unzip_success']]);
                } else {
                    echo json_encode(['error' => $lang['unzip_failed']]);
                }
            }
            break;
        case 'search':
            if (isset($_POST['path']) && isset($_POST['query'])) {
                $path = $_POST['path'];
                $query = $_POST['query'];
                $results = search_item($path, $query);
                echo json_encode($results);
            }
            break;
        case 'create_folder':
            if (isset($_POST['path']) && isset($_POST['name'])) {
                $path = $_POST['path'];
                $name = $_POST['name'];
                if (create_folder($path, $name)) {
                    echo json_encode(['success' => $lang['create_folder_success']]);
                } else {
                    echo json_encode(['error' => $lang['create_folder_failed']]);
                }
            }
            break;
        case 'create_file':
            if (isset($_POST['path']) && isset($_POST['name'])) {
                $path = $_POST['path'];
                $name = $_POST['name'];
                if (create_file($path, $name)) {
                    echo json_encode(['success' => $lang['create_file_success']]);
                } else {
                    echo json_encode(['error' => $lang['create_file_failed']]);
                }
            }
            break;
        case 'rename':
            if (isset($_POST['old']) && isset($_POST['new'])) {
                $old = $_POST['old'];
                $new = $_POST['new'];
                if (rename_item($old, $new)) {
                    echo json_encode(['success' => $lang['rename_success']]);
                } else {
                    echo json_encode(['error' => $lang['rename_failed']]);
                }
            }
            break;
        case 'chmod':
            if (isset($_POST['path']) && isset($_POST['permissions'])) {
                $path = $_POST['path'];
                $permissions = $_POST['permissions'];
                if (chmod_item($path, octdec($permissions))) {
                    echo json_encode(['success' => $lang['chmod_success']]);
                } else {
                    echo json_encode(['error' => $lang['chmod_failed']]);
                }
            }
            break;
        case 'view':
            if (isset($_GET['path'])) {
                $path = $_GET['path'];
                $content = get_file_content($path);
                echo $content;
            }
            break;
        default:
            break;
    }
    exit;
}
// ############# End of Actions #############
?>
<!DOCTYPE html>
<html lang="<?php echo $language; ?>">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo $lang['title']; ?></title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css">
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            font-size: 14px;
            line-height: 1.5;
            color: #333;
            background-color: #fff;
            margin: 0;
            padding: 0;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 15px;
        }

        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
        }

        .header h1 {
            font-size: 24px;
            margin: 0;
        }

        .header .actions {
            display: flex;
            align-items: center;
        }

        .header .actions a {
            display: inline-block;
            padding: 8px 12px;
            border-radius: 4px;
            background-color: #007bff;
            color: #fff;
            text-decoration: none;
            margin-left: 10px;
        }

        .header .actions a:hover {
            background-color: #0069d9;
        }

        .breadcrumbs {
            margin-bottom: 15px;
        }

        .breadcrumbs a {
            color: #007bff;
            text-decoration: none;
        }

        .breadcrumbs a:hover {
            text-decoration: underline;
        }

        .table {
            width: 100%;
            border-collapse: collapse;
        }

        .table th,
        .table td {
            padding: 8px 12px;
            border: 1px solid #ddd;
            text-align: left;
        }

        .table th {
            background-color: #f2f2f2;
            font-weight: bold;
        }

        .table tbody tr:hover {
            background-color: #f5f5f5;
        }

        .table .actions {
            display: flex;
            align-items: center;
        }

        .table .actions a {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 4px;
            background-color: #007bff;
            color: #fff;
            text-decoration: none;
            margin-left: 10px;
        }

        .table .actions a:hover {
            background-color: #0069d9;
        }

        .table .actions .delete {
            background-color: #dc3545;
        }

        .table .actions .delete:hover {
            background-color: #c82333;
        }

        .form {
            margin-bottom: 15px;
        }

        .form input[type="text"],
        .form input[type="file"],
        .form textarea {
            width: 100%;
            padding: 8px 12px;
            border: 1px solid #ddd;
            border-radius: 4px;
            margin-bottom: 10px;
        }

        .form textarea {
            height: 200px;
        }

        .form .actions {
            display: flex;
            justify-content: flex-end;
            align-items: center;
        }

        .form .actions button {
            display: inline-block;
            padding: 8px 12px;
            border-radius: 4px;
            background-color: #007bff;
            color: #fff;
            text-decoration: none;
            margin-left: 10px;
            border: none;
            cursor: pointer;
        }

        .form .actions button:hover {
            background-color: #0069d9;
        }

        .form .actions .cancel {
            background-color: #6c757d;
        }

        .form .actions .cancel:hover {
            background-color: #5a6268;
        }

        .modal {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.5);
            display: none;
            justify-content: center;
            align-items: center;
            z-index: 9999;
        }

        .modal .modal-content {
            background-color: #fff;
            padding: 15px;
            border-radius: 4px;
            width: 500px;
        }

        .modal .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
        }

        .modal .modal-header h2 {
            font-size: 20px;
            margin: 0;
        }

        .modal .modal-header .close {
            font-size: 24px;
            font-weight: bold;
            color: #000;
            text-decoration: none;
            cursor: pointer;
        }

        .modal .modal-body {
            margin-bottom: 15px;
        }

        .modal .modal-footer {
            display: flex;
            justify-content: flex-end;
            align-items: center;
        }

        .modal .modal-footer button {
            display: inline-block;
            padding: 8px 12px;
            border-radius: 4px;
            background-color: #007bff;
            color: #fff;
            text-decoration: none;
            margin-left: 10px;
            border: none;
            cursor: pointer;
        }

        .modal .modal-footer button:hover {
            background-color: #0069d9;
        }

        .modal .modal-footer .cancel {
            background-color: #6c757d;
        }

        .modal .modal-footer .cancel:hover {
            background-color: #5a6268;
        }

        <?php if ($theme === 'dark'): ?>
        body {
            color: #fff;
            background-color: #222;
        }

        .table th,
        .table td {
            border: 1px solid #444;
        }

        .table th {
            background-color: #333;
        }

        .table tbody tr:hover {
            background-color: #333;
        }

        .form input[type="text"],
        .form input[type="file"],
        .form textarea {
            background-color: #333;
            color: #fff;
            border: 1px solid #444;
        }

        .modal .modal-content {
            background-color: #333;
        }

        .modal .modal-header .close {
            color: #fff;
        }
        <?php endif; ?>
    </style>
</head>
<body>
<div class="container">
    <div class="header">
        <h1><?php echo $lang['title']; ?></h1>
        <div class="actions">
            <?php if ($allowed_actions['upload']): ?>
                <a href="#" class="upload-btn"><i class="fas fa-upload"></i> <?php echo $lang['upload']; ?></a>
            <?php endif; ?>
            <?php if ($allowed_actions['create_folder']): ?>
                <a href="#" class="create-folder-btn"><i class="fas fa-folder-plus"></i> <?php echo $lang['create_folder']; ?></a>
            <?php endif; ?>
            <?php if ($allowed_actions['create_file']): ?>
                <a href="#" class="create-file-btn"><i class="fas fa-file-plus"></i> <?php echo $lang['create_file']; ?></a>
            <?php endif; ?>
            <?php if ($allowed_actions['search']): ?>
                <a href="#" class="search-btn"><i class="fas fa-search"></i> <?php echo $lang['search']; ?></a>
            <?php endif; ?>
            <a href="?"><i class="fas fa-sync-alt"></i> <?php echo $lang['refresh']; ?></a>
            <?php if ($auth_method !== 'none'): ?>
                <a href="?logout"><i class="fas fa-sign-out-alt"></i> <?php echo $lang['logout']; ?></a>
            <?php endif; ?>
        </div>
    </div>
    <div class="breadcrumbs">
        <a href="?"><i class="fas fa-home"></i> <?php echo $lang['home']; ?></a>
        <?php
        $path = isset($_GET['path']) ? $_GET['path'] : $root_path;
        $breadcrumbs = get_breadcrumbs($path);
        foreach ($breadcrumbs as $breadcrumb) {
            echo ' / <a href="?path=' . urlencode($breadcrumb['path']) . '">' . $breadcrumb['name'] . '</a>';
        }
        ?>
    </div>
    <table class="table">
        <thead>
        <tr>
            <th><?php echo $lang['name']; ?></th>
            <th><?php echo $lang['size']; ?></th>
            <th><?php echo $lang['date']; ?></th>
            <th><?php echo $lang['permissions']; ?></th>
            <th><?php echo $lang['actions']; ?></th>
        </tr>
        </thead>
        <tbody>
        <?php
        $files = get_files($path);
        foreach ($files as $file) {
            echo '<tr>';
            echo '<td><i class="fas fa-' . $file['icon'] . '"></i> <a href="' . ($file['is_dir'] ? '?path=' . urlencode($file['path']) : '?action=view&path=' . urlencode($file['path'])) . '">' . $file['name'] . '</a></td>';
            echo '<td>' . $file['size'] . '</td>';
            echo '<td>' . $file['date'] . '</td>';
            echo '<td>' . $file['permissions'] . '</td>';
            echo '<td class="actions">';
            if (!$file['is_dir']) {
                if ($allowed_actions['download']) {
                    echo '<a href="?action=download&path=' . urlencode($file['path']) . '" title="' . $lang['download'] . '"><i class="fas fa-download"></i></a>';
                }
                if ($allowed_actions['edit']) {
                    echo '<a href="#" class="edit-btn" data-path="' . urlencode($file['path']) . '" title="' . $lang['edit'] . '"><i class="fas fa-edit"></i></a>';
                }
            }
            if ($allowed_actions['rename']) {
                echo '<a href="#" class="rename-btn" data-path="' . urlencode($file['path']) . '" data-name="' . $file['name'] . '" title="' . $lang['rename'] . '"><i class="fas fa-i-cursor"></i></a>';
            }
            if ($allowed_actions['delete']) {
                echo '<a href="#" class="delete-btn" data-path="' . urlencode($file['path']) . '" title="' . $lang['delete'] . '"><i class="fas fa-trash"></i></a>';
            }
            if ($allowed_actions['copy']) {
                echo '<a href="#" class="copy-btn" data-path="' . urlencode($file['path']) . '" title="' . $lang['copy'] . '"><i class="fas fa-copy"></i></a>';
            }
            if (isset($_SESSION['clipboard']) && is_dir($file['path']) && $allowed_actions['paste']) {
                echo '<a href="#" class="paste-btn" data-path="' . urlencode($file['path']) . '" title="' . $lang['paste'] . '"><i class="fas fa-paste"></i></a>';
            }
            if ($allowed_actions['zip'] && (is_dir($file['path']) || is_file($file['path']))) {
                echo '<a href="#" class="zip-btn" data-path="' . urlencode($file['path']) . '" title="' . $lang['zip'] . '"><i class="fas fa-file-archive"></i></a>';
            }
            if ($allowed_actions['unzip'] && pathinfo($file['path'], PATHINFO_EXTENSION) === 'zip') {
                echo '<a href="#" class="unzip-btn" data-path="' . urlencode($file['path']) . '" title="' . $lang['unzip'] . '"><i class="fas fa-file-archive"></i></a>';
            }
            if ($allowed_actions['chmod']) {
                echo '<a href="#" class="chmod-btn" data-path="' . urlencode($file['path']) . '" data-permissions="' . substr(sprintf('%o', fileperms($file['path'])), -4) . '" title="' . $lang['chmod'] . '"><i class="fas fa-key"></i></a>';
            }
            echo '</td>';
            echo '</tr>';
        }
        ?>
        </tbody>
    </table>
</div>

<div class="modal" id="upload-modal">
    <div class="modal-content">
        <div class="modal-header">
            <h2><?php echo $lang['upload']; ?></h2>
            <a href="#" class="close">&times;</a>
        </div>
        <div class="modal-body">
            <form id="upload-form" action="?action=upload" method="post" enctype="multipart/form-data">
                <input type="hidden" name="path" value="<?php echo $path; ?>">
                <input type="file" name="files[]" multiple>
            </form>
        </div>
        <div class="modal-footer">
            <button class="cancel"><?php echo $lang['cancel']; ?></button>
            <button class="submit" form="upload-form"><?php echo $lang['submit']; ?></button>
        </div>
    </div>
</div>

<div class="modal" id="create-folder-modal">
    <div class="modal-content">
        <div class="modal-header">
            <h2><?php echo $lang['create_folder']; ?></h2>
            <a href="#" class="close">&times;</a>
        </div>
        <div class="modal-body">
            <form id="create-folder-form" action="?action=create_folder" method="post">
                <input type="hidden" name="path" value="<?php echo $path; ?>">
                <input type="text" name="name" placeholder="<?php echo $lang['name']; ?>" required>
            </form>
        </div>
        <div class="modal-footer">
            <button class="cancel"><?php echo $lang['cancel']; ?></button>
            <button class="submit" form="create-folder-form"><?php echo $lang['submit']; ?></button>
        </div>
    </div>
</div>

<div class="modal" id="create-file-modal">
    <div class="modal-content">
        <div class="modal-header">
            <h2><?php echo $lang['create_file']; ?></h2>
            <a href="#" class="close">&times;</a>
        </div>
        <div class="modal-body">
            <form id="create-file-form" action="?action=create_file" method="post">
                <input type="hidden" name="path" value="<?php echo $path; ?>">
                <input type="text" name="name" placeholder="<?php echo $lang['name']; ?>" required>
            </form>
        </div>
        <div class="modal-footer">
            <button class="cancel"><?php echo $lang['cancel']; ?></button>
            <button class="submit" form="create-file-form"><?php echo $lang['submit']; ?></button>
        </div>
    </div>
</div>

<div class="modal" id="rename-modal">
    <div class="modal-content">
        <div class="modal-header">
            <h2><?php echo $lang['rename']; ?></h2>
            <a href="#" class="close">&times;</a>
        </div>
        <div class="modal-body">
            <form id="rename-form" action="?action=rename" method="post">
                <input type="hidden" name="old" value="">
                <input type="text" name="new" placeholder="<?php echo $lang['name']; ?>" required>
            </form>
        </div>
        <div class="modal-footer">
            <button class="cancel"><?php echo $lang['cancel']; ?></button>
            <button class="submit" form="rename-form"><?php echo $lang['submit']; ?></button>
        </div>
    </div>
</div>

<div class="modal" id="delete-modal">
    <div class="modal-content">
        <div class="modal-header">
            <h2><?php echo $lang['delete']; ?></h2>
            <a href="#" class="close">&times;</a>
        </div>
        <div class="modal-body">
            <p><?php echo $lang['are_you_sure']; ?></p>
        </div>
        <div class="modal-footer">
            <button class="cancel"><?php echo $lang['no']; ?></button>
            <button class="submit" id="delete-confirm-btn"><?php echo $lang['yes']; ?></button>
        </div>
    </div>
</div>

<div class="modal" id="edit-modal">
    <div class="modal-content">
        <div class="modal-header">
            <h2><?php echo $lang['edit']; ?></h2>
            <a href="#" class="close">&times;</a>
        </div>
        <div class="modal-body">
            <form id="edit-form" action="?action=edit" method="post">
                <input type="hidden" name="path" value="">
                <textarea name="content" placeholder="<?php echo $lang['file']; ?>"></textarea>
            </form>
        </div>
        <div class="modal-footer">
            <button class="cancel"><?php echo $lang['cancel']; ?></button>
            <button class="submit" form="edit-form"><?php echo $lang['save']; ?></button>
        </div>
    </div>
</div>

<div class="modal" id="search-modal">
    <div class="modal-content">
        <div class="modal-header">
            <h2><?php echo $lang['search']; ?></h2>
            <a href="#" class="close">&times;</a>
        </div>
        <div class="modal-body">
            <form id="search-form" action="?action=search" method="post">
                <input type="hidden" name="path" value="<?php echo $path; ?>">
                <input type="text" name="query" placeholder="<?php echo $lang['search']; ?>" required>
            </form>
        </div>
        <div class="modal-footer">
            <button class="cancel"><?php echo $lang['cancel']; ?></button>
            <button class="submit" form="search-form"><?php echo $lang['submit']; ?></button>
        </div>
    </div>
</div>

<div class="modal" id="zip-modal">
    <div class="modal-content">
        <div class="modal-header">
            <h2><?php echo $lang['zip']; ?></h2>
            <a href="#" class="close">&times;</a>
        </div>
        <div class="modal-body">
            <form id="zip-form" action="?action=zip" method="post">
                <input type="hidden" name="source" value="">
                <input type="text" name="destination" placeholder="<?php echo $lang['name']; ?>" required>
            </form>
        </div>
        <div class="modal-footer">
            <button class="cancel"><?php echo $lang['cancel']; ?></button>
            <button class="submit" form="zip-form"><?php echo $lang['submit']; ?></button>
        </div>
    </div>
</div>

<div class="modal" id="unzip-modal">
    <div class="modal-content">
        <div class="modal-header">
            <h2><?php echo $lang['unzip']; ?></h2>
            <a href="#" class="close">&times;</a>
        </div>
        <div class="modal-body">
            <form id="unzip-form" action="?action=unzip" method="post">
                <input type="hidden" name="source" value="">
                <input type="text" name="destination" placeholder="<?php echo $lang['path']; ?>" required>
            </form>
        </div>
        <div class="modal-footer">
            <button class="cancel"><?php echo $lang['cancel']; ?></button>
            <button class="submit" form="unzip-form"><?php echo $lang['submit']; ?></button>
        </div>
    </div>
</div>

<div class="modal" id="chmod-modal">
    <div class="modal-content">
        <div class="modal-header">
            <h2><?php echo $lang['chmod']; ?></h2>
            <a href="#" class="close">&times;</a>
        </div>
        <div class="modal-body">
            <form id="chmod-form" action="?action=chmod" method="post">
                <input type="hidden" name="path" value="">
                <input type="text" name="permissions" placeholder="<?php echo $lang['permissions']; ?>" required>
            </form>
        </div>
        <div class="modal-footer">
            <button class="cancel"><?php echo $lang['cancel']; ?></button>
            <button class="submit" form="chmod-form"><?php echo $lang['submit']; ?></button>
        </div>
    </div>
</div>

<script>
    document.addEventListener('DOMContentLoaded', function () {
        function showModal(id) {
            document.getElementById(id).style.display = 'flex';
        }

        function hideModal(id) {
            document.getElementById(id).style.display = 'none';
        }

        document.querySelectorAll('.modal .close, .modal .cancel').forEach(function (el) {
            el.addEventListener('click', function (e) {
                e.preventDefault();
                hideModal(el.closest('.modal').id);
            });
        });

        document.querySelector('.upload-btn').addEventListener('click', function (e) {
            e.preventDefault();
            showModal('upload-modal');
        });

        document.querySelector('.create-folder-btn').addEventListener('click', function (e) {
            e.preventDefault();
            showModal('create-folder-modal');
        });

        document.querySelector('.create-file-btn').addEventListener('click', function (e) {
            e.preventDefault();
            showModal('create-file-modal');
        });

        document.querySelector('.search-btn').addEventListener('click', function (e) {
            e.preventDefault();
            showModal('search-modal');
        });

        document.querySelectorAll('.rename-btn').forEach(function (el) {
            el.addEventListener('click', function (e) {
                e.preventDefault();
                document.querySelector('#rename-form input[name="old"]').value = el.dataset.path;
                document.querySelector('#rename-form input[name="new"]').value = el.dataset.name;
                showModal('rename-modal');
            });
        });

        document.querySelectorAll('.delete-btn').forEach(function (el) {
            el.addEventListener('click', function (e) {
                e.preventDefault();
                document.getElementById('delete-confirm-btn').dataset.path = el.dataset.path;
                showModal('delete-modal');
            });
        });

        document.querySelectorAll('.edit-btn').forEach(function (el) {
            el.addEventListener('click', function (e) {
                e.preventDefault();
                document.querySelector('#edit-form input[name="path"]').value = el.dataset.path;
                fetch('?action=view&path=' + el.dataset.path)
                    .then(response => response.text())
                    .then(data => {
                        document.querySelector('#edit-form textarea[name="content"]').value = data;
                        showModal('edit-modal');
                    });
            });
        });

        document.querySelectorAll('.copy-btn').forEach(function (el) {
            el.addEventListener('click', function (e) {
                e.preventDefault();
                fetch('?action=copy', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: 'source=' + el.dataset.path,
                })
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            location.reload();
                        } else {
                            alert(data.error);
                        }
                    });
            });
        });

        document.querySelectorAll('.paste-btn').forEach(function (el) {
            el.addEventListener('click', function (e) {
                e.preventDefault();
                fetch('?action=paste', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: 'destination=' + el.dataset.path,
                })
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            location.reload();
                        } else {
                            alert(data.error);
                        }
                    });
            });
        });

        document.querySelectorAll('.zip-btn').forEach(function (el) {
            el.addEventListener('click', function (e) {
                e.preventDefault();
                document.querySelector('#zip-form input[name="source"]').value = el.dataset.path;
                document.querySelector('#zip-form input[name="destination"]').value = el.dataset.path + '.zip';
                showModal('zip-modal');
            });
        });

        document.querySelectorAll('.unzip-btn').forEach(function (el) {
            el.addEventListener('click', function (e) {
                e.preventDefault();
                document.querySelector('#unzip-form input[name="source"]').value = el.dataset.path;
                document.querySelector('#unzip-form input[name="destination"]').value = '<?php echo $path; ?>';
                showModal('unzip-modal');
            });
        });

        document.querySelectorAll('.chmod-btn').forEach(function (el) {
            el.addEventListener('click', function (e) {
                e.preventDefault();
                document.querySelector('#chmod-form input[name="path"]').value = el.dataset.path;
                document.querySelector('#chmod-form input[name="permissions"]').value = el.dataset.permissions;
                showModal('chmod-modal');
            });
        });

        document.getElementById('delete-confirm-btn').addEventListener('click', function (e) {
            e.preventDefault();
            fetch('?action=delete', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: 'path=' + e.target.dataset.path,
            })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        location.reload();
                    } else {
                        alert(data.error);
                    }
                });
        });

        document.querySelectorAll('form').forEach(function (el) {
            el.addEventListener('submit', function (e) {
                e.preventDefault();
                fetch(el.action, {
                    method: 'POST',
                    body: new FormData(el),
                })
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            location.reload();
                        } else {
                            alert(data.error);
                        }
                    });
            });
        });
    });
</script>
</body>
</html>
