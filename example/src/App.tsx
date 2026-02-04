import { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  FlatList,
  Alert,
  Switch,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Queue } from 'expo-queue';
import { SQLiteAdapter } from 'expo-queue/sqlite';

// Types
type Todo = {
  id: string;
  title: string;
  completed: boolean;
  createdAt: string;
};

type QueueStats = {
  pending: number;
  completed: number;
  failed: number;
};

export default function App() {
  const [queue, setQueue] = useState<Queue | null>(null);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [newTodoTitle, setNewTodoTitle] = useState('');
  const [stats, setStats] = useState<QueueStats>({
    pending: 0,
    completed: 0,
    failed: 0,
  });
  const [requireNetwork, setRequireNetwork] = useState(false);

  // Initialize Queue
  useEffect(() => {
    const initQueue = async () => {
      // Use SQLite adapter for persistence
      const adapter = new SQLiteAdapter('todo-queue.db', 'jobs');
      const q = new Queue(adapter, { concurrency: 2 });

      // Register workers

      // 1. Add Todo Worker (Simulates API call)
      q.addWorker<Todo>(
        'addTodo',
        async (_id, payload) => {
          console.log('Processing addTodo:', payload.title);

          // Simulate API delay
          await new Promise((resolve) => setTimeout(resolve, 1000));

          // Simulate random failure (10% chance)
          if (Math.random() < 0.1) {
            throw new Error('Network error!');
          }

          // Add to local state
          setTodos((prev) => [...prev, payload]);
        },
        {
          onSuccess: (job) => {
            const payload = job.payload as Todo;
            console.log('✅ Todo added:', payload.title);
            setStats((prev) => ({ ...prev, completed: prev.completed + 1 }));
          },
          onFailed: (job, error) => {
            const payload = job.payload as Todo;
            console.log('❌ Failed to add todo:', error.message);
            setStats((prev) => ({ ...prev, failed: prev.failed + 1 }));

            // Show retry message
            if (job.attempts < job.maxAttempts) {
              Alert.alert(
                'Retrying',
                `Will retry "${payload.title}" in 2 seconds...`
              );
            } else {
              Alert.alert(
                'Failed',
                `Could not add "${payload.title}" after ${job.maxAttempts} attempts`
              );
            }
          },
        }
      );

      // 2. Sync Worker (Background sync - requires network)
      q.addWorker('syncTodos', async () => {
        console.log('Syncing todos...');
        await new Promise((resolve) => setTimeout(resolve, 500));
        console.log('✅ Sync complete');
      });

      // 3. Cleanup old todos (TTL example)
      q.addWorker('cleanup', async () => {
        console.log('Cleaning up old incomplete todos...');
        const now = new Date().getTime();
        setTodos((prev) =>
          prev.filter((todo) => {
            const age = now - new Date(todo.createdAt).getTime();
            return todo.completed || age < 24 * 60 * 60 * 1000; // Keep if completed or < 1 day old
          })
        );
      });

      // Event listeners
      q.on('start', (job) => {
        console.log('🚀 Job started:', job.name);
        setStats((prev) => ({ ...prev, pending: prev.pending + 1 }));
      });

      setQueue(q);
    };

    initQueue();
  }, []);

  // Add a new todo
  const handleAddTodo = async () => {
    if (!newTodoTitle.trim() || !queue) return;

    const todo: Todo = {
      id: Date.now().toString(),
      title: newTodoTitle,
      completed: false,
      createdAt: new Date().toISOString(),
    };

    // Add to queue with retry logic
    await queue.addJob('addTodo', todo, {
      priority: 1,
      attempts: 3, // Retry up to 3 times
      timeInterval: 2000, // Wait 2 seconds between retries
      ttl: 60000, // Expire after 1 minute
      onlineOnly: requireNetwork, // Only run when online if toggled
    });

    setNewTodoTitle('');
    Alert.alert('Queued', 'Todo added to queue!');
  };

  // Trigger background sync
  const handleSync = async () => {
    if (!queue) return;

    await queue.addJob('syncTodos', null, {
      onlineOnly: true, // Always require network for sync
      attempts: 2,
    });

    Alert.alert('Syncing', 'Background sync started');
  };

  // Schedule cleanup job
  const handleCleanup = async () => {
    if (!queue) return;

    await queue.addJob('cleanup', null, {
      ttl: 5000, // Expire if not run within 5 seconds
    });

    Alert.alert('Cleanup', 'Scheduled cleanup task');
  };

  // Toggle todo completion
  const toggleTodo = (id: string) => {
    setTodos((prev) =>
      prev.map((todo) =>
        todo.id === id ? { ...todo, completed: !todo.completed } : todo
      )
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar style="auto" />

      <View style={styles.header}>
        <Text style={styles.title}>Queue Demo: To-Do App</Text>
        <Text style={styles.subtitle}>
          Demonstrating retries, TTL, and network awareness
        </Text>
      </View>

      {/* Stats */}
      <View style={styles.stats}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{stats.pending}</Text>
          <Text style={styles.statLabel}>Pending</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, styles.success]}>
            {stats.completed}
          </Text>
          <Text style={styles.statLabel}>Completed</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, styles.error]}>{stats.failed}</Text>
          <Text style={styles.statLabel}>Failed</Text>
        </View>
      </View>

      {/* Add Todo */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Enter a new todo..."
          value={newTodoTitle}
          onChangeText={setNewTodoTitle}
          onSubmitEditing={handleAddTodo}
        />
        <TouchableOpacity style={styles.addButton} onPress={handleAddTodo}>
          <Text style={styles.addButtonText}>Add</Text>
        </TouchableOpacity>
      </View>

      {/* Network Toggle */}
      <View style={styles.networkToggle}>
        <Text style={styles.toggleLabel}>Require Network for Add:</Text>
        <Switch
          value={requireNetwork}
          onValueChange={setRequireNetwork}
          trackColor={{ false: '#ccc', true: '#4CAF50' }}
          thumbColor={requireNetwork ? '#fff' : '#f4f3f4'}
        />
      </View>

      {/* Action Buttons */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionButton} onPress={handleSync}>
          <Text style={styles.actionButtonText}>
            🔄 Sync (Requires Network)
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, styles.cleanupButton]}
          onPress={handleCleanup}
        >
          <Text style={styles.actionButtonText}>🧹 Cleanup Old (TTL: 5s)</Text>
        </TouchableOpacity>
      </View>

      {/* Todo List */}
      <FlatList
        data={todos}
        keyExtractor={(item) => item.id}
        style={styles.list}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No todos yet. Add one above!</Text>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.todoItem}
            onPress={() => toggleTodo(item.id)}
          >
            <View
              style={[
                styles.checkbox,
                item.completed && styles.checkboxChecked,
              ]}
            >
              {item.completed && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <View style={styles.todoContent}>
              <Text
                style={[
                  styles.todoTitle,
                  item.completed && styles.todoTitleCompleted,
                ]}
              >
                {item.title}
              </Text>
              <Text style={styles.todoDate}>
                {new Date(item.createdAt).toLocaleString()}
              </Text>
            </View>
          </TouchableOpacity>
        )}
      />

      {/* Info Panel */}
      <View style={styles.infoPanel}>
        <Text style={styles.infoTitle}>📚 Queue Features Demo:</Text>
        <Text style={styles.infoText}>
          • <Text style={styles.bold}>Retries:</Text> Failed todos retry 3x with
          2s delay
        </Text>
        <Text style={styles.infoText}>
          • <Text style={styles.bold}>TTL:</Text> Jobs expire after 1 min
        </Text>
        <Text style={styles.infoText}>
          • <Text style={styles.bold}>Network:</Text> Toggle to require online
          status
        </Text>
        <Text style={styles.infoText}>
          • <Text style={styles.bold}>Persistence:</Text> Queue survives app
          restarts
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    paddingTop: 50,
    paddingHorizontal: 20,
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
  },
  stats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  statLabel: {
    fontSize: 12,
    color: '#999',
    marginTop: 5,
  },
  success: {
    color: '#4CAF50',
  },
  error: {
    color: '#f44336',
  },
  inputContainer: {
    flexDirection: 'row',
    marginBottom: 15,
  },
  input: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 15,
    paddingVertical: 12,
    fontSize: 16,
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  addButton: {
    backgroundColor: '#2196F3',
    borderRadius: 8,
    paddingHorizontal: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  networkToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 15,
  },
  toggleLabel: {
    fontSize: 14,
    color: '#333',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 15,
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#FF9800',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  cleanupButton: {
    backgroundColor: '#9C27B0',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  list: {
    flex: 1,
    marginBottom: 10,
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    fontSize: 16,
    marginTop: 40,
  },
  todoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 15,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#2196F3',
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#2196F3',
  },
  checkmark: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  todoContent: {
    flex: 1,
  },
  todoTitle: {
    fontSize: 16,
    color: '#333',
    marginBottom: 4,
  },
  todoTitleCompleted: {
    textDecorationLine: 'line-through',
    color: '#999',
  },
  todoDate: {
    fontSize: 12,
    color: '#999',
  },
  infoPanel: {
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    padding: 12,
    marginTop: 10,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1976D2',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 12,
    color: '#555',
    marginBottom: 4,
  },
  bold: {
    fontWeight: '600',
  },
});
